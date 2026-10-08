---
name: cg-cli
description: Retrieve focused repository context for a JavaScript/TypeScript codebase using a local structural code graph (cg-cli).
---

# CG-CLI Agent Skill

This skill describes how an AI coding agent can use cg-cli as a local context-retrieval tool.
Actual automatic invocation depends on the host agent's supported skill/tool mechanism. This
repository does not implement or test integration with any specific agent.

## What cg-cli is

cg-cli is a local command-line tool. It indexes a JavaScript/TypeScript repository (.js, .jsx,
.ts, .tsx) into a structural graph (files, functions, methods, classes, symbols; relations
CONTAINS, IMPORTS, EXPORTS, CALLS, REFERENCES) and uses graph-guided retrieval to select the
source slices most relevant to a developer question.

- It works locally and offline. No paid API, login or API key is required.
- It does NOT generate the final answer. It prepares repository context; you reason over it.

## Problem it solves

Reading whole files or many files to answer a narrow question supplies far more context than needed.
cg-cli returns exact source slices for the relevant symbols plus their direct graph neighbours.

## When to use it

- The repository is unfamiliar or large.
- The question spans several files (dependencies, call chains, data flow, impact of a change).
- The developer asks where a function/class is defined or used.
- The developer asks about a bug, an error path, configuration, routes, tests or security checks.

## Commands (run from the root of the repository you are analysing)

```
cg index                                   # build/refresh .cg/index.json (re-run after code changes)
cg context "<developer question>"          # compact context packet (stdout) + metrics (stderr)
cg context "<question>" --trace            # also explain WHY each node was selected
cg context "<question>" --explain          # also show the top scored candidates
cg context "<question>" --depth 2          # graph expansion depth 0, 1 (default) or 2
cg context "<question>" --adaptive         # add one more hop if the confidence heuristic is low
cg context "<question>" --budget 12000     # character budget (default 8000, minimum 200)
cg inspect <symbol>                        # type, file, exact lines, relations, source of one symbol
cg ask "<question>" --out prompt.txt       # offline: context + response-format prompt saved to a file
```

If `cg` is not on the PATH, run `node <path-to-cg-cli>/dist/cli.js <command>` instead.
Put the question in double quotes. The packet is printed on stdout; metrics and notes go to stderr.

## Workflow

1. Make sure the repository is indexed (`cg index`). Re-index after you or the developer change code.
2. Run `cg context "<the developer's question>"`.
3. Read the packet:
   - `Selected node` blocks are the top-ranked symbols (seeds), with path, symbol, lines and exact source.
   - `Related node (reason)` blocks are graph neighbours, e.g. "CALLS edge from login".
   - `Relations:` lines list the symbol's outgoing CALLS / REFERENCES / IMPORTS.
   - `Related tests:` lists test files that look related (paths only, no code).
   - Slices that did not fit the budget are listed on stderr as skipped.
4. Answer the question using the returned source as evidence. Cite file, symbol and lines.
5. If the context is insufficient, run `cg inspect <symbol>` on a promising symbol or run a more
   specific `cg context` query (name a function, file or error). Consider `--depth 2`.
6. If it is still insufficient, say what is missing (for example `Need: src/db.ts`) instead of guessing.

## Rules

- Never invent repository details.
- Never claim cg-cli found something that is not in the returned context. If you read a file by other
  means, say so.
- Treat the packet as evidence, not as proof that nothing else is relevant.

## Limitations

- The graph is static and structural. It can miss runtime/dynamic behaviour.
- Only `foo()`, `this.foo()` and `Name.foo()` calls are recorded. Instance-method calls such as
  `service.create()` are not graph edges.
- Retrieval is deterministic keyword/path/symbol scoring plus graph expansion, not semantic search.
  Questions without identifiable names may retrieve little or nothing ("No relevant code found").
- Expansion is at most two hops. Indirect dependencies can be missed.
- A slice larger than the remaining budget is skipped, not trimmed.
- Token figures printed by cg-cli are estimates (ceil(characters / 4)), not tokenizer counts.
- Retrieval recall in the project's benchmark is measured on controlled fixtures against gold symbols;
  it does not prove answer correctness.