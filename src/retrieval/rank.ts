import { CgIndex, GraphNode } from '../indexer/graph';
import { NormalizedQuery, isTestFile, splitIdentifier, tokenMatches } from './query';

// Heuristic weights (not scientific claims). Change them here to experiment.
export const WEIGHTS = {
  exactName: 10,
  path: 8,
  keyword: 5,
  relation: 4,
  testOrError: 3,
  related: 2,
};

export interface ScoredNode {
  node: GraphNode;
  score: number;
  reasons: string[];
}

const ERROR_NAME_WORDS = new Set([
  'error', 'err', 'exception', 'fail', 'failure', 'invalid', 'unauthorized',
  'forbidden', 'denied', 'expired', 'reject', 'guard',
]);

const RELATION_EDGES = new Set(['CALLS', 'REFERENCES', 'IMPORTS', 'EXPORTS']);
const TYPE_PRIORITY: Record<string, number> = { function: 0, method: 0, class: 0, symbol: 1, file: 2 };

function pathTokens(file: string): string[] {
  return splitIdentifier(file.replace(/\.[^./]+$/, '')); // drop the extension
}

export function overlaps(a: GraphNode, b: GraphNode): boolean {
  return a.file === b.file && a.startLine <= b.endLine && b.startLine <= a.endLine;
}

function scoreNode(node: GraphNode, q: NormalizedQuery): ScoredNode | null {
  if (node.module) return null; // external packages have no local code

  let score = 0;
  const reasons: string[] = [];
  const isFile = node.type === 'file';

  const lowerName = node.name.toLowerCase();
  const shortName = lowerName.slice(lowerName.lastIndexOf('.') + 1);
  const nameTokens = isFile ? [] : splitIdentifier(node.name);
  const fileTokens = pathTokens(node.file);

  // 1) exact symbol-name match
  if (!isFile && (q.rawTokens.has(lowerName) || q.rawTokens.has(shortName))) {
    score += WEIGHTS.exactName;
    reasons.push(`exact name (+${WEIGHTS.exactName})`);
  }

  // 2) keyword match in the symbol name (max 3 words counted)
  const nameHits = q.terms.filter((t) => nameTokens.some((k) => tokenMatches(t, k)));
  if (nameHits.length > 0) {
    const points = Math.min(nameHits.length, 3) * WEIGHTS.keyword;
    score += points;
    reasons.push(`name keyword: ${nameHits.slice(0, 3).join(', ')} (+${points})`);
  }

  // 3) filename / path match (counted once)
  const lowerFile = node.file.toLowerCase();
  const pathHit =
    q.terms.some((t) => fileTokens.some((k) => tokenMatches(t, k))) ||
    q.pathHints.some((h) => lowerFile.includes(h));
  if (pathHit) {
    score += WEIGHTS.path;
    reasons.push(`path (+${WEIGHTS.path})`);
  }

  // 4) helper words from the RELATED table (lower weight, max 2 words)
  const relatedHits = q.related.filter(
    (t) => nameTokens.some((k) => tokenMatches(t, k)) || fileTokens.some((k) => tokenMatches(t, k))
  );
  if (relatedHits.length > 0) {
    const points = Math.min(relatedHits.length, 2) * WEIGHTS.related;
    score += points;
    reasons.push(`related word: ${relatedHits.slice(0, 2).join(', ')} (+${points})`);
  }

  // 5) test/error bonus, only for nodes that already matched something
  if (score > 0) {
    if (q.testIntent && isTestFile(node.file)) {
      score += WEIGHTS.testOrError;
      reasons.push(`test file (+${WEIGHTS.testOrError})`);
    } else if (
      q.errorIntent &&
      [...nameTokens, ...fileTokens].some((k) => ERROR_NAME_WORDS.has(k))
    ) {
      score += WEIGHTS.testOrError;
      reasons.push(`error-related (+${WEIGHTS.testOrError})`);
    }
  }

  return score > 0 ? { node, score, reasons } : null;
}

function sortScored(list: ScoredNode[]): void {
  list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const typeDiff = (TYPE_PRIORITY[a.node.type] ?? 3) - (TYPE_PRIORITY[b.node.type] ?? 3);
    if (typeDiff !== 0) return typeDiff;
    const sizeDiff = a.node.endLine - a.node.startLine - (b.node.endLine - b.node.startLine);
    if (sizeDiff !== 0) return sizeDiff; // smaller = more specific
    return a.node.id < b.node.id ? -1 : 1;
  });
}

/** Scores every node, adds a small boost for nodes directly linked to the top matches, sorts. */
export function rankNodes(index: CgIndex, q: NormalizedQuery): ScoredNode[] {
  const scored: ScoredNode[] = [];
  for (const node of index.nodes) {
    const s = scoreNode(node, q);
    if (s) scored.push(s);
  }
  sortScored(scored);

  const topIds = new Set(scored.slice(0, 5).map((s) => s.node.id));
  const near = new Set<string>();
  for (const edge of index.edges) {
    if (!RELATION_EDGES.has(edge.type) || edge.from === edge.to) continue;
    if (topIds.has(edge.from)) near.add(edge.to);
    if (topIds.has(edge.to)) near.add(edge.from);
  }
  for (const s of scored) {
    if (near.has(s.node.id)) {
      s.score += WEIGHTS.relation;
      s.reasons.push(`linked to a top match (+${WEIGHTS.relation})`);
    }
  }

  sortScored(scored);
  return scored;
}

/** Picks up to `max` seeds: code nodes preferred, no duplicates, no overlapping line ranges. */
export function selectSeeds(ranked: ScoredNode[], max = 3): ScoredNode[] {
  const codeNodes = ranked.filter((r) => r.node.type !== 'file');
  const pool = codeNodes.length > 0 ? codeNodes : ranked;

  const seeds: ScoredNode[] = [];
  for (const candidate of pool) {
    if (seeds.length >= max) break;
    if (seeds.some((s) => s.node.id === candidate.node.id || overlaps(s.node, candidate.node))) continue;
    seeds.push(candidate);
  }
  return seeds;
}