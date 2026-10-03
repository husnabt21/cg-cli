import * as path from 'path';
import { CgIndex, GraphNode } from '../indexer/graph';
import { ScoredNode, overlaps } from './rank';
import { isTestFile } from './query';

export interface RelatedNode {
  node: GraphNode;
  reason: string; // e.g. "CALLS edge from login"
  score: number;
  depth: number; // 1 = direct relation, 2 = second-degree relation
}

export interface Expansion {
  related: RelatedNode[];
  tests: string[]; // related test files (pointers only, no code)
}

function baseStem(file: string): string {
  return path.posix
    .basename(file)
    .replace(/\.(test|spec)\.[jt]sx?$/i, '')
    .replace(/\.[jt]sx?$/i, '')
    .toLowerCase();
}

/**
 * Expands the seed nodes along CALLS / REFERENCES edges (both directions).
 * depth 0 = seeds only, 1 = direct relations, 2 = second-degree relations.
 */
export function expandGraph(
  index: CgIndex,
  seeds: ScoredNode[],
  scoreById: Map<string, number>,
  depth: number,
  maxRelated: number = depth >= 2 ? 12 : 8
): Expansion {
  if (depth <= 0) return { related: [], tests: [] };

  const nodeById = new Map<string, GraphNode>(index.nodes.map((n): [string, GraphNode] => [n.id, n]));
  const seedNodes = seeds.map((s) => s.node);
  const visited = new Set<string>(seedNodes.map((n) => n.id));
  const found = new Map<string, RelatedNode & { order: number }>();

  let frontier: GraphNode[] = seedNodes.filter((n) => n.type !== 'file');

  for (let hop = 1; hop <= depth; hop++) {
    const next: GraphNode[] = [];
    for (const current of frontier) {
      for (const edge of index.edges) {
        if (edge.type !== 'CALLS' && edge.type !== 'REFERENCES') continue;

        let otherId: string;
        let base: string;
        let order: number;

        if (edge.from === current.id) {
          otherId = edge.to;
          base = `${edge.type} edge from ${current.name}`;
          order = edge.type === 'CALLS' ? 0 : 2;
        } else if (edge.to === current.id) {
          otherId = edge.from;
          base = `${edge.type} edge to ${current.name}` + (edge.type === 'CALLS' ? ' (caller)' : ' (references it)');
          order = edge.type === 'CALLS' ? 1 : 3;
        } else {
          continue;
        }

        const other = nodeById.get(otherId);
        if (!other || other.type === 'file' || other.module) continue;
        if (visited.has(other.id) || seedNodes.some((s) => overlaps(s, other))) continue;

        visited.add(other.id);
        found.set(other.id, {
          node: other,
          reason: hop > 1 ? `${base} (hop ${hop})` : base,
          score: (hop === 1 ? 4 : 2) + (scoreById.get(other.id) ?? 0),
          depth: hop,
          order,
        });
        next.push(other);
      }
    }
    frontier = next;
  }

  const related = Array.from(found.values())
    .sort(
      (a, b) =>
        a.depth - b.depth || b.score - a.score || a.order - b.order || (a.node.id < b.node.id ? -1 : 1)
    )
    .slice(0, maxRelated)
    .map(({ node, reason, score, depth: d }): RelatedNode => ({ node, reason, score, depth: d }));

  // Related test files: same base name as a seed file, or a test file that imports it.
  const seedFiles = new Set(seedNodes.map((n) => n.file));
  const tests: string[] = [];
  for (const f of index.files) {
    if (!isTestFile(f.path) || seedFiles.has(f.path)) continue;
    const sameName = Array.from(seedFiles).some((sf) => baseStem(sf) === baseStem(f.path));
    const importsSeed = index.edges.some(
      (e) =>
        e.type === 'IMPORTS' &&
        e.from === `file:${f.path}` &&
        e.to.startsWith('file:') &&
        seedFiles.has(e.to.slice(5))
    );
    if (sameName || importsSeed) tests.push(f.path);
  }

  return { related, tests: tests.slice(0, 3) };
}