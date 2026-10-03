import { GraphNode } from '../indexer/graph';
import { NormalizedQuery, splitIdentifier, tokenMatches } from './query';

export interface ConfidenceLog {
  initial: number; // 0..1
  final: number; // 0..1
  expanded: boolean; // did adaptive retrieval add another hop?
  finalDepth: number;
}

/**
 * Retrieval confidence HEURISTIC: the fraction of query terms found in the names or
 * file paths of the selected nodes. It is not calibrated or scientifically validated.
 */
export function retrievalConfidence(query: NormalizedQuery, nodes: GraphNode[]): number {
  if (query.terms.length === 0 || nodes.length === 0) return 0;

  const tokens = new Set<string>();
  for (const node of nodes) {
    for (const t of splitIdentifier(node.name)) tokens.add(t);
    for (const t of splitIdentifier(node.file.replace(/\.[^./]+$/, ''))) tokens.add(t);
  }
  const list = Array.from(tokens);
  const covered = query.terms.filter((term) => list.some((token) => tokenMatches(term, token)));
  return covered.length / query.terms.length;
}

export function formatConfidence(c: ConfidenceLog): string {
  const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;
  return (
    `Retrieval confidence heuristic: initial ${pct(c.initial)}, final ${pct(c.final)} ` +
    `(expanded: ${c.expanded ? 'yes' : 'no'}, depth ${c.finalDepth}). Not calibrated.`
  );
}