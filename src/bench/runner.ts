import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { CgIndex, GraphNode } from '../indexer/graph';
import { indexProject } from '../indexer/build';
import { runPipeline } from '../retrieval/pipeline';
import { computeMetrics, estimateTokens } from '../metrics/metrics';
import { BenchCase, Dataset } from './dataset';
import { CaseRecord, RepoInfo, RunRecord, VariantInfo } from './store';

// These are experiment settings, not questions.
export const VARIANTS: VariantInfo[] = [
  { id: 'seed_only', label: 'Seed only (depth 0)', depth: 0, adaptive: false },
  { id: 'one_hop', label: 'Seed + one hop (depth 1)', depth: 1, adaptive: false },
  { id: 'two_hop', label: 'Seed + two hops (depth 2)', depth: 2, adaptive: false },
  { id: 'adaptive', label: 'Adaptive (depth 1, up to 2)', depth: 1, adaptive: true },
];

interface Loaded {
  root: string;
  index: CgIndex;
}

export interface Resolved {
  matches: (nodes: GraphNode[]) => boolean;
}

/** Commit hash only if the project folder is its own git repository. Never invented. */
function gitCommit(dir: string): string | null {
  if (!fs.existsSync(path.join(dir, '.git'))) return null;
  const result = spawnSync('git rev-parse HEAD', { cwd: dir, shell: true, encoding: 'utf8', timeout: 10000 });
  const out = (result.stdout || '').trim();
  return result.status === 0 && /^[0-9a-f]{40}$/.test(out) ? out : null;
}

/** "file:Symbol" must match a node; plain "file" matches any included node from that file. */
export function resolveExpected(index: CgIndex, expected: string): Resolved | null {
  const colon = expected.indexOf(':');
  if (colon === -1) {
    if (!index.files.some((f) => f.path === expected)) return null;
    return { matches: (nodes) => nodes.some((n) => n.file === expected) };
  }
  const file = expected.slice(0, colon);
  const symbol = expected.slice(colon + 1);
  const ids = new Set(
    index.nodes.filter((n) => n.type !== 'file' && n.file === file && n.name === symbol).map((n) => n.id)
  );
  if (ids.size === 0) return null;
  return { matches: (nodes) => nodes.some((n) => ids.has(n.id)) };
}

function blankRecord(c: BenchCase, variant: VariantInfo): CaseRecord {
  return {
    caseId: c.id,
    category: c.category,
    repository: c.repository,
    question: c.question,
    variant: variant.id,
    depth: variant.depth,
    status: 'ok',
    error: null,
    baselineChars: 0,
    selectedChars: 0,
    baselineTokensEst: 0,
    selectedTokensEst: 0,
    reductionPct: null,
    baselineUnits: 0,
    selectedUnits: 0,
    selectedNodes: 0,
    expectedCount: c.expected.length,
    hitCount: 0,
    missedNotRetrieved: [],
    missedBudget: [],
    recallPct: null,
    confidenceInitial: null,
    confidenceFinal: null,
    expanded: null,
    finalDepth: null,
    seeds: [],
  };
}

function evaluateCase(
  loaded: Map<string, Loaded>,
  repoErrors: Map<string, string>,
  c: BenchCase,
  variant: VariantInfo,
  budget: number
): CaseRecord {
  const base = blankRecord(c, variant);
  const repo = loaded.get(c.repository);
  if (!repo) {
    const error = repoErrors.get(c.repository) ?? `unknown repository "${c.repository}"`;
    return { ...base, status: 'data_error', error };
  }
  if (c.expected.length === 0) return { ...base, status: 'data_error', error: 'case has no expected symbols' };

  const resolved: Resolved[] = [];
  const unresolved: string[] = [];
  for (const exp of c.expected) {
    const r = resolveExpected(repo.index, exp);
    if (r) resolved.push(r);
    else unresolved.push(exp);
  }
  if (unresolved.length > 0) {
    return { ...base, status: 'data_error', error: `expected not found in index: ${unresolved.join(', ')}` };
  }

  const result = runPipeline(repo.index, repo.root, c.question, {
    budget,
    depth: variant.depth,
    adaptive: variant.adaptive,
  });

  if (!result) {
    return { ...base, status: 'no_match', hitCount: 0, missedNotRetrieved: c.expected.slice(), recallPct: 0 };
  }

  const seedNodes = result.seeds.map((s) => s.node);
  const candidates = [...seedNodes, ...result.expansion.related.map((r) => r.node)];
  const included = result.packet.includedNodes;

  let hits = 0;
  const missedNotRetrieved: string[] = [];
  const missedBudget: string[] = [];
  c.expected.forEach((label, i) => {
    if (resolved[i].matches(included)) hits++;
    else if (resolved[i].matches(candidates)) missedBudget.push(label);
    else missedNotRetrieved.push(label);
  });

  const metrics = computeMetrics(repo.root, repo.index, c.question, seedNodes, result.packet);

  return {
    ...base,
    baselineChars: metrics.baselineChars,
    selectedChars: metrics.selectedChars,
    baselineTokensEst: estimateTokens(metrics.baselineChars),
    selectedTokensEst: estimateTokens(metrics.selectedChars),
    reductionPct: metrics.reductionPct,
    baselineUnits: metrics.baselineFiles,
    selectedUnits: included.length,
    selectedNodes: metrics.selectedNodes,
    hitCount: hits,
    missedNotRetrieved,
    missedBudget,
    recallPct: (hits / c.expected.length) * 100,
    confidenceInitial: result.confidence.initial,
    confidenceFinal: result.confidence.final,
    expanded: result.confidence.expanded,
    finalDepth: result.confidence.finalDepth,
    seeds: seedNodes.map((n) => n.name),
  };
}

export async function executeBenchmark(
  dataset: Dataset,
  budget: number,
  log: (message: string) => void
): Promise<RunRecord> {
  const loaded = new Map<string, Loaded>();
  const repoErrors = new Map<string, string>();
  const repositories: RepoInfo[] = [];

  for (const repo of dataset.repositories) {
    const root = path.resolve(dataset.baseDir, repo.path);
    if (!fs.existsSync(root)) {
      repoErrors.set(repo.name, `repository path not found: ${repo.path}`);
      log(`  ${repo.name}: path not found (${repo.path})`);
      continue;
    }
    const { index, failures } = await indexProject(root);
    loaded.set(repo.name, { root, index });
    repositories.push({
      name: repo.name,
      path: repo.path,
      commit: gitCommit(root),
      files: index.files.length,
      nodes: index.nodes.length,
      edges: index.edges.length,
    });
    log(
      `  ${repo.name}: ${index.files.length} files, ${index.nodes.length} nodes, ${index.edges.length} edges` +
        (failures.length > 0 ? ` (${failures.length} parse failures)` : '')
    );
  }

  const records: CaseRecord[] = [];
  let done = 0;
  for (const c of dataset.cases) {
    for (const variant of VARIANTS) records.push(evaluateCase(loaded, repoErrors, c, variant, budget));
    done++;
    if (done % 25 === 0) log(`  ${done}/${dataset.cases.length} cases done`);
  }

  const startedAt = new Date().toISOString();
  const dataErrors = new Set(records.filter((r) => r.status === 'data_error').map((r) => r.caseId)).size;

  return {
    runId: 'run-' + startedAt.replace(/[:.]/g, '-'),
    startedAt,
    datasetFile: path.relative(process.cwd(), dataset.file),
    datasetCases: dataset.cases.length,
    budget,
    variants: VARIANTS,
    repositories,
    records,
    warnings: dataset.warnings,
    dataErrors,
  };
}