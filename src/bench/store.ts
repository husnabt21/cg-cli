import * as fs from 'fs';
import * as path from 'path';

export interface VariantInfo {
  id: string;
  label: string;
  depth: number;
  adaptive: boolean;
}

export interface RepoInfo {
  name: string;
  path: string;
  commit: string | null; // null when the project is not its own git repository
  files: number;
  nodes: number;
  edges: number;
}

export interface CaseRecord {
  caseId: string;
  category: string;
  repository: string;
  question: string;
  variant: string;
  depth: number;
  status: 'ok' | 'no_match' | 'data_error';
  error: string | null;
  baselineChars: number;
  selectedChars: number;
  baselineTokensEst: number;
  selectedTokensEst: number;
  reductionPct: number | null;
  baselineUnits: number; // distinct files in the whole-file baseline
  selectedUnits: number; // node slices in the packet
  selectedNodes: number;
  expectedCount: number;
  hitCount: number;
  missedNotRetrieved: string[];
  missedBudget: string[];
  recallPct: number | null;
  confidenceInitial: number | null;
  confidenceFinal: number | null;
  expanded: boolean | null;
  finalDepth: number | null;
  seeds: string[];
}

export interface RunRecord {
  runId: string;
  startedAt: string;
  datasetFile: string;
  datasetCases: number;
  budget: number;
  variants: VariantInfo[];
  repositories: RepoInfo[];
  records: CaseRecord[];
  warnings: string[];
  dataErrors: number;
}

export interface Store {
  version: number;
  runs: RunRecord[];
}

export function storePath(): string {
  return path.resolve(process.cwd(), 'benchmarks', 'results', 'runs.json');
}

export function loadStore(): Store {
  const file = storePath();
  if (!fs.existsSync(file)) return { version: 1, runs: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Store;
}

export function appendRun(run: RunRecord): void {
  const store = loadStore();
  store.runs.push(run);
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store), 'utf8');
}