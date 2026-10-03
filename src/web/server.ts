import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { CgIndex, GraphNode } from '../indexer/graph';
import { indexProject } from '../indexer/build';
import { loadIndex, runPipeline } from '../retrieval/pipeline';
import { normalizeQuery } from '../retrieval/query';
import { computeMetrics, estimateTokens } from '../metrics/metrics';
import { resolveExpected } from '../bench/runner';
import { RunRecord } from '../bench/store';
import { PRIMARY_VARIANT, aggregate, byCategory } from '../bench/summary';
import { CAVEMAN_PROMPT } from '../policy/compact';
import { hasGreeting, isNeedAnswer, sectionPresence, validateResponse } from '../validation/validator';

// The server only ever analyzes the built-in demo fixture. It never accepts file paths from the browser.
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const DEMO_NAME = 'task-service';
const DEMO_ROOT = path.join(PACKAGE_ROOT, 'benchmarks', 'projects', DEMO_NAME);
const PAGE_FILE = path.join(PACKAGE_ROOT, 'web', 'index.html');
const CASES_FILE = path.join(PACKAGE_ROOT, 'benchmarks', 'cases.json');
const RUNS_FILE = path.join(PACKAGE_ROOT, 'benchmarks', 'results', 'runs.json');
const DEFAULT_QUESTION = 'Why does the create task request return 500?';

const BASELINE_POLICY =
  'Baseline policy: whole-file baseline. The complete source of every distinct file that contains a node ' +
  'included in the compact context (see src/metrics/metrics.ts). It is not the whole repository.';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface CaseDef {
  id: string;
  category: string;
  repository: string;
  question: string;
  expected: string[];
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage, limit = 2000000): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

function demoCases(): CaseDef[] {
  if (!fs.existsSync(CASES_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));
    return (raw.cases as CaseDef[]).filter((c) => c.repository === DEMO_NAME);
  } catch {
    return [];
  }
}

function readSlice(root: string, node: GraphNode): string {
  try {
    const lines = fs.readFileSync(path.join(root, node.file), 'utf8').split(/\r?\n/);
    return lines.slice(node.startLine - 1, node.endLine).join('\n');
  } catch {
    return '(source not available)';
  }
}

function fileText(root: string, file: string): string {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8');
  } catch {
    return '';
  }
}

function avg(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

// ---------- API handlers ----------
function status(): object {
  return {
    demoAvailable: fs.existsSync(DEMO_ROOT),
    demoPath: 'benchmarks/projects/' + DEMO_NAME,
    defaultQuestion: DEFAULT_QUESTION,
    cavemanPrompt: CAVEMAN_PROMPT,
  };
}

async function analyze(body: any): Promise<object> {
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) throw new HttpError(400, 'Please enter a question.');
  if (question.length > 500) throw new HttpError(400, 'Question is too long (max 500 characters).');

  const depth = [0, 1, 2].includes(Number(body.depth)) ? Number(body.depth) : 1;
  const adaptive = body.adaptive === true;
  const budget = 8000;

  if (!fs.existsSync(DEMO_ROOT)) {
    throw new HttpError(404, 'Demo project not found. Run "node benchmarks/generate.js" in the cg-cli folder first.');
  }
  let loaded: CgIndex | null = loadIndex(DEMO_ROOT);
  if (!loaded) loaded = (await indexProject(DEMO_ROOT)).index;
  const index: CgIndex = loaded;

  const project = {
    name: DEMO_NAME,
    path: 'benchmarks/projects/' + DEMO_NAME,
    files: index.files.length,
    nodes: index.nodes.length,
    edges: index.edges.length,
  };

  const result = runPipeline(index, DEMO_ROOT, question, { budget, depth, adaptive });
  if (!result) return { noMatch: true, question, project, terms: normalizeQuery(question).terms };

  const seedNodes = result.seeds.map((s) => s.node);
  const metrics = computeMetrics(DEMO_ROOT, index, question, seedNodes, result.packet);
  const included = result.packet.includedNodes;
  const includedIds = new Set(included.map((n) => n.id));

  // Selected items (exactly the nodes whose source is inside the packet)
  const items: object[] = [];
  const itemNodes: Array<GraphNode & { role: string }> = [];
  const addItem = (node: GraphNode, role: string, relationship: string): void => {
    items.push({
      role,
      type: node.type,
      symbol: node.name,
      file: node.file,
      startLine: node.startLine,
      endLine: node.endLine,
      relationship,
      source: readSlice(DEMO_ROOT, node),
    });
    itemNodes.push({ ...node, role });
  };
  for (const s of result.seeds) {
    if (includedIds.has(s.node.id)) addItem(s.node, 'seed', `${s.reasons.join('; ') || 'matched'} (score ${s.score})`);
  }
  for (const r of result.expansion.related) {
    if (includedIds.has(r.node.id)) addItem(r.node, 'related', r.reason);
  }

  // Retrieved subgraph: only real index edges between selected nodes
  const ids = new Set(itemNodes.map((n) => n.id));
  const edges = index.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).slice(0, 200);

  // Baseline (whole-file) details
  const baselineFiles = Array.from(new Set(included.map((n) => n.file)));
  const baselineList = baselineFiles.map((f) => ({ path: f, chars: fileText(DEMO_ROOT, f).length }));
  const baselineContext = baselineFiles
    .map((f) => `// ===== ${f} =====\n${fileText(DEMO_ROOT, f)}`)
    .join('\n\n');

  // Retrieval recall only if this exact question is a benchmark case with gold symbols
  let recall: object | null = null;
  const gold = demoCases().find((c) => c.question === question);
  if (gold) {
    const resolved = gold.expected.map((e) => resolveExpected(index, e));
    if (resolved.some((r) => r === null)) {
      recall = { caseId: gold.id, error: 'A gold symbol for this case is missing from the index (benchmark data error).' };
    } else {
      const candidates = [...seedNodes, ...result.expansion.related.map((r) => r.node)];
      let hits = 0;
      const missedNotRetrieved: string[] = [];
      const missedBudget: string[] = [];
      gold.expected.forEach((label, i) => {
        const r = resolved[i]!;
        if (r.matches(included)) hits++;
        else if (r.matches(candidates)) missedBudget.push(label);
        else missedNotRetrieved.push(label);
      });
      recall = {
        caseId: gold.id,
        expected: gold.expected.length,
        hits,
        recallPct: (hits / gold.expected.length) * 100,
        missedNotRetrieved,
        missedBudget,
      };
    }
  }

  return {
    noMatch: false,
    question,
    project,
    retrieval: {
      depth,
      adaptive,
      terms: result.query.terms,
      confidence: result.confidence,
    },
    baseline: {
      policy: BASELINE_POLICY,
      files: baselineList,
      projectChars: metrics.projectChars,
    },
    metrics: {
      baselineChars: metrics.baselineChars,
      baselineTokens: estimateTokens(metrics.baselineChars),
      selectedChars: metrics.selectedChars,
      selectedTokens: estimateTokens(metrics.selectedChars),
      reductionPct: metrics.reductionPct,
      selectedNodes: metrics.selectedNodes,
      baselineUnits: metrics.baselineFiles,
      selectedUnits: included.length,
    },
    counts: {
      seeds: itemNodes.filter((n) => n.role === 'seed').length,
      related: itemNodes.filter((n) => n.role === 'related').length,
    },
    relationsFollowed: result.expansion.related.filter((r) => includedIds.has(r.node.id)).map((r) => `${r.node.name}: ${r.reason}`),
    skipped: result.packet.skipped,
    recall,
    items,
    graph: {
      nodes: itemNodes.map((n) => ({ id: n.id, name: n.name, type: n.type, role: n.role })),
      edges: edges.map((e) => ({ from: e.from, to: e.to, type: e.type })),
    },
    optimizedContext: result.packet.text,
    baselineContext,
  };
}

function describeResponse(text: string): object {
  const provided = text.trim().length > 0;
  const validation = validateResponse(text);
  return {
    provided,
    chars: text.length,
    estimatedTokens: estimateTokens(text.length),
    words: provided ? text.trim().split(/\s+/).length : 0,
    proseWords: validation.proseWords,
    greeting: hasGreeting(text),
    needAnswer: isNeedAnswer(text),
    sections: sectionPresence(text),
    warnings: provided ? validation.warnings : [],
  };
}

function compare(body: any): object {
  const baseline = typeof body.baselineResponse === 'string' ? body.baselineResponse : '';
  const compact = typeof body.compactResponse === 'string' ? body.compactResponse : '';
  if (!baseline.trim() && !compact.trim()) throw new HttpError(400, 'Paste at least one response.');
  if (baseline.length > 200000 || compact.length > 200000) throw new HttpError(400, 'Response too long (max 200000 characters).');

  const responseReductionPct =
    baseline.trim() && compact.trim() ? ((baseline.length - compact.length) / baseline.length) * 100 : null;

  return {
    model: typeof body.model === 'string' ? body.model : '',
    baseline: describeResponse(baseline),
    compact: describeResponse(compact),
    responseReductionPct,
  };
}

function benchmarkSummary(): object {
  if (!fs.existsSync(RUNS_FILE)) return { available: false };
  let run: RunRecord | undefined;
  try {
    const store = JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'));
    run = store.runs && store.runs.length > 0 ? store.runs[store.runs.length - 1] : undefined;
  } catch {
    return { available: false };
  }
  if (!run) return { available: false };

  const variants = run.variants.map((v) => {
    const records = run!.records.filter((r) => r.variant === v.id);
    const ok = records.filter((r) => r.status === 'ok');
    const a = aggregate(records);
    return {
      id: v.id,
      label: v.label,
      depth: v.depth,
      adaptive: v.adaptive,
      cases: a.total,
      successful: ok.length,
      noMatch: a.noMatch,
      errors: a.dataErrors,
      recall: a.recall,
      reduction: a.reduction,
      selectedChars: a.selectedChars ?? 0,
      baselineChars: a.baselineChars ?? 0,
      selectedTokens: avg(ok.map((r) => r.selectedTokensEst)) ?? 0,
      baselineTokens: avg(ok.map((r) => r.baselineTokensEst)) ?? 0,
      selectedNodes: a.selectedNodes,
    };
  });
  const primary = variants.find((v) => v.id === PRIMARY_VARIANT) ?? variants[0];
  const primaryRecords = run.records.filter((r) => r.variant === primary.id);

  return {
    available: true,
    runId: run.runId,
    startedAt: run.startedAt,
    datasetFile: run.datasetFile,
    repositories: run.repositories.length,
    budget: run.budget,
    baselinePolicy: BASELINE_POLICY,
    primary,
    variants,
    categories: byCategory(primaryRecords).map((c) => ({
      label: c.label,
      cases: c.agg.total,
      recall: c.agg.recall,
      reduction: c.agg.reduction,
    })),
    cases: primaryRecords.map((r) => ({
      id: r.caseId,
      category: r.category,
      status: r.status,
      recall: r.recallPct,
      reduction: r.reductionPct,
      nodes: r.selectedNodes,
      selectedChars: r.selectedChars,
      baselineChars: r.baselineChars,
    })),
  };
}

// ---------- server ----------
async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = `${req.method} ${url.pathname}`;

  switch (route) {
    case 'GET /': {
      if (!fs.existsSync(PAGE_FILE)) throw new HttpError(500, 'web/index.html not found.');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(PAGE_FILE));
      return;
    }
    case 'GET /favicon.ico':
      res.writeHead(204);
      res.end();
      return;
    case 'GET /api/status':
      return sendJson(res, 200, status());
    case 'GET /api/questions':
      return sendJson(res, 200, {
        questions: demoCases().map((c) => ({ id: c.id, category: c.category, question: c.question })),
      });
    case 'GET /api/benchmark':
      return sendJson(res, 200, benchmarkSummary());
    case 'POST /api/analyze':
      return sendJson(res, 200, await analyze(parseJson(await readBody(req))));
    case 'POST /api/compare':
      return sendJson(res, 200, compare(parseJson(await readBody(req))));
    default:
      return sendJson(res, 404, { error: 'Not found' });
  }
}

export function startServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      const statusCode = err instanceof HttpError ? err.status : 500;
      sendJson(res, statusCode, { error: err instanceof Error ? err.message : String(err) });
    });
  });
  server.listen(port, '127.0.0.1'); // local only
  return server;
}