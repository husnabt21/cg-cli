# cg-cli

A model-agnostic local tool for **context optimization**: it builds a static code graph of a
JavaScript/TypeScript project, retrieves only the code relevant to a developer question, and
packs it into a compact context packet that you can give to any AI model (Claude, ChatGPT,
Gemini, ...). cg-cli itself calls no model and needs no account, login or API key.

## Problem

1. **Input context bloat.** Agents often read whole files or many files to answer a narrow question.
2. **Output conversational bloat.** Replies often contain greetings, restated requests and process
   explanations before the useful part.

## Research question

Can graph-guided code retrieval reduce the amount of repository context supplied to an AI coding
agent while preserving the relevant information needed to answer diverse developer tasks?

## Architecture

```
Developer question
  -> normalize query (lowercase, camelCase split, light stemming, stopwords)
  -> local code graph (.cg/index.json: files, functions, methods, classes, symbols; edges)
  -> keyword/path/symbol scoring -> 1-3 seed nodes
  -> graph expansion (depth 0, 1 or 2 hops along CALLS / REFERENCES edges)
  -> exact source slices read from disk, within a character budget
  -> compact context packet (+ compact-response policy)
  -> any AI model (manual copy/paste)  ->  reply validated by cg-cli
```

Source layout: `src/indexer` (indexing), `src/retrieval` (query, rank, expand, packet, pipeline, trace,
confidence), `src/metrics`, `src/policy`, `src/validation`, `src/bench` (benchmark engine),
`src/commands`, `benchmarks/` (generator, fixtures, `cases.json`, results).

## How graph retrieval works

- **Nodes** are files, functions, methods, classes and symbols with exact line ranges. **Edges** are
  CONTAINS, IMPORTS, EXPORTS, CALLS and REFERENCES.
- Scoring (heuristic weights): exact symbol-name match +10, file/path match +8, keyword in a symbol
  name +5 per word (max 3), directly linked to a top match +4, test/error bonus +3.
- The top 1-3 code nodes (not whole files) become **seeds**. Expansion then adds nodes connected by
  CALLS/REFERENCES edges: depth 0 = seeds only, depth 1 = direct relations, depth 2 = second-degree.
- `--trace` prints why each node was selected (score reasons or the edge that led to it).
- **Adaptive mode** (`--adaptive`): if the *retrieval confidence heuristic* (fraction of query terms
  found in selected node names/paths) is below 60%, one more hop is added (max depth 2). Initial and
  final confidence are logged. The heuristic is not calibrated.

## Context optimization

Only exact source slices of selected nodes are included, plus short relation lines. Slices that do not
fit the character budget (default 8000, `--budget N`) are skipped, never cut in the middle.

## Baseline definition

- **Baseline:** the complete source contents of every distinct file represented by the selected nodes
  (what an agent would read if it opened whole files).
- **Selected context:** the real length of the context packet text, including headers and relations.
- Estimated tokens = characters / 4. These are **estimates**, not tokenizer counts.
- Reduction = (1 - selected / baseline) x 100. It can be negative for small files.

## Retrieval recall

Each benchmark case has a manually defined gold list of expected symbols (`file:Symbol`) or files.
Recall = expected items found in the packet / expected items. Misses are split into *never retrieved*
and *retrieved but excluded by the context budget*. A plain file entry counts as found if any included
node comes from that file. This is retrieval recall against a gold set, **not** answer correctness.

## Context units

"Repository exploration/context units": baseline units = distinct files that would be supplied;
selected units = source slices (nodes) in the packet. These are **not** AI tool-call counts. Real
tool-call reduction would need an agent integration that measures actual calls.

## Model-agnostic workflow

```powershell
cg ask "What does validateAccountInput do?" --out prompt.txt
```
1. Paste `prompt.txt` into Claude web, ChatGPT, Gemini or another model.
2. Save the model's real reply as `reply.txt`.
3. `cg ask "What does validateAccountInput do?" --check reply.txt` validates the reply
   (sections Answer / Evidence / Action / Risk, greeting, more than 120 prose words). It only warns
   and never modifies the file.

## Benchmark methodology

- `benchmarks/generate.js` creates 10 controlled JS/TS fixture projects and `benchmarks/cases.json`.
- The runner is data-driven: repositories and questions come only from the JSON file. Add real
  repositories later by adding entries to `repositories` (paths are relative to `cases.json`).
- Each case runs on four variants: seed only, seed + one hop, seed + two hops, adaptive. This is the
  ablation that shows what graph expansion adds on top of keyword matching and what it costs.
- If an expected symbol does not exist in a fixture, the case is reported as a data error, not scored.
- Commit hashes are recorded only when a project folder is its own git repository.

## 150-case benchmark design

15 categories x 10 cases = 150 distinct questions: bug diagnosis, code navigation, function
understanding, class/object understanding, dependency tracing, error path, data flow, impact analysis,
test relationship, configuration, API/route, database access, security/validation, performance
investigation, feature/change. Case *n* of each category targets fixture project *n*. The fixtures
contain no executed bugs and no profiler data: these are information-location tasks, not diagnoses.
The gold sets and fixtures come from the same generator, so results show how retrieval behaves on
controlled projects, not on real-world repositories.

The benchmark measures repository context reduction and retrieval recall. It does not by itself prove
end-to-end AI answer correctness or actual model tool-call reduction.

## Dashboard and results

`cg results`, `cg dashboard` and `cg history` read `benchmarks/results/runs.json`, written by
`cg benchmark`. If no run exists they print "No benchmark results recorded yet."

## Privacy

Source code is indexed locally and the graph is stored locally in `.cg/`. No cloud service is needed
for indexing or retrieval. Model interaction is optional and manual: you choose what to paste into an
external AI service, and that text is then handled by that service.

## How to run

```powershell
npm install
npm run build
npm link
node benchmarks/generate.js
cg benchmark
cg results
cg dashboard
```

## Example commands (inside any indexed project)

```powershell
cg index
cg inspect createTaskHandler
cg context "Where is the timeout configured?" --trace
cg context "What calls insertOrder?" --depth 2
cg context "Which tests cover the create route?" --adaptive
cg ask "Where is user input validated?" --out prompt.txt
cg ask "Where is user input validated?" --check reply.txt
```

## Local web dashboard (demonstration layer)

`cg dashboard` starts a local web server (127.0.0.1 only) and opens a single-page dashboard. The CLI
remains the core research system; the dashboard reuses the same modules (parser, graph, retrieval,
baseline, metrics, benchmark results, validator) and adds no logic of its own. It needs no internet,
account or API key. The previous terminal dashboard is still available as `cg dashboard --terminal`.

**Graft Engine / Caveman Filter.** These are labels for the two phases of this project: the inbound
phase (graph-guided context retrieval) and the outbound phase (a model-neutral compact-response
protocol). cg-cli is not the original Graft or Caveman project.

**Launch:** `cg dashboard` (options `--port N`, `--no-open`). Stop with Ctrl+C.

**Demo:** the "Run Demo" button analyzes the existing `benchmarks/projects/task-service` fixture with
the question "Why does the create task request return 500?". You can type any question about that
project or pick one of its benchmark questions. The server only analyzes this built-in fixture.

**Manual model comparison:** copy the baseline context (whole files) or the optimized context plus
the Caveman prompt into any model yourself, paste the replies into the dashboard, and it computes
characters, estimated tokens, words, section presence, greeting detection, compactness warnings and
response-length reduction. Correctness and equivalence are judged by you with the manual checkboxes.

**Token estimation:** estimated tokens = characters / 4 (local estimate, not a tokenizer count).
**Baseline:** whole-file baseline = complete contents of every distinct file containing a selected
node (not the whole repository). **Benchmark/ablation:** read from `benchmarks/results/runs.json`
(written by `cg benchmark`); if it does not exist the dashboard says "No benchmark results available."

**Measured:** context size and estimated tokens, context reduction, retrieved nodes, cg-cli retrieval operations (source slices read), retrieval recall against gold symbols (benchmark cases only), response length. **Not measured:**
actual AI tool calls, real tokenizer counts, answer correctness or functional equivalence.
Limitations are listed at the end of the dashboard page and in the Limitations section above.

## Using CG-CLI with AI Coding Agents

CG-CLI prepares repository context; it does not itself generate the final AI answer.

1. Index the repository: `cg index`.
2. Ask cg-cli for context relevant to the developer question: `cg context "<question>"`
   (add `--trace` to see why each node was selected).
3. The graph-guided retrieval engine selects relevant repository context: top-ranked symbols plus
   their direct graph neighbours, as exact source slices within a character budget.
4. An external coding agent or model can use that context to reason about the code.
5. `SKILL.md` documents the agent-facing workflow (commands, how to read the output, limitations).

Automatic invocation by Claude Code, Codex or any other agent depends on that host agent's supported
skill/tool mechanism. This repository does not implement or test such an integration, and cg-cli does
not control an agent's internal tool loop.

### Knowledge Graph Explorer

The web dashboard (`cg dashboard`) includes a Knowledge Graph Explorer for the demo project. It reads
the real `.cg/index.json` (nodes and edges are never synthesized), shows file/node/edge/function/class/
method/symbol counts, lets you search a symbol or file, filter relation types
(CONTAINS, IMPORTS, EXPORTS, CALLS, REFERENCES) and inspect a node's relations. Nodes selected by the
last "Analyze" are marked. The Caveman prompt and manual response comparison are kept as an
"Optional Manual Model Evaluation" and are separate from the retrieval engine.

## Limitations

- JavaScript/TypeScript focus (.js, .jsx, .ts, .tsx).
- Static graph: indirect/dynamic calls are missed. Only `foo()`, `this.foo()` and `Name.foo()` calls are
  recorded, so calls such as `service.create()` on an instance variable are not edges.
- Data flow is only partially represented (no data-flow edges, no throw/catch edges).
- One- and two-hop expansion is limited; indirect dependencies may be missed.
- Nested helper functions fold into their outer function; tsconfig path aliases count as external.
- A node larger than the remaining budget is skipped, not trimmed.
- Token counts are estimated with chars / 4.
- Retrieval recall depends on manually defined gold symbols and controlled fixtures.
- Actual model answer quality requires a separate model experiment.
- Actual AI tool-call reduction requires an agent integration and is not claimed.