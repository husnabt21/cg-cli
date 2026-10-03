import * as fs from 'fs';
import * as path from 'path';
import { CgIndex, EdgeType, GraphEdge, GraphNode } from '../indexer/graph';
import { RelatedNode } from './expand';

export const DEFAULT_BUDGET = 8000;

const FENCE_LANG: Record<string, string> = { '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.jsx': 'jsx' };
const MAX_RELATION_LINES = 6;
const MAX_QUESTION_CHARS = 300;

export interface PacketInput {
  question: string;
  root: string;
  index: CgIndex;
  seeds: GraphNode[];
  related: RelatedNode[];
  tests: string[];
  budget: number;
}

export interface PacketResult {
  text: string;
  chars: number;
  includedSeeds: number;
  includedRelated: number;
  skipped: string[]; // slices that did not fit the budget
  includedNodes: GraphNode[]; // nodes whose source is inside the packet
}

interface Item {
  node: GraphNode;
  title: string; // "Selected node" or "Related node (callee of login)"
  isSeed: boolean;
}

export function buildPacket(input: PacketInput): PacketResult {
  const { root, index, budget } = input;

  const nodeById = new Map<string, GraphNode>(index.nodes.map((n): [string, GraphNode] => [n.id, n]));
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of index.edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }

  const fileCache = new Map<string, string[] | null>();
  function readLines(file: string): string[] | null {
    if (!fileCache.has(file)) {
      const full = path.join(root, file);
      fileCache.set(file, fs.existsSync(full) ? fs.readFileSync(full, 'utf8').split(/\r?\n/) : null);
    }
    return fileCache.get(file) ?? null;
  }

  function relationLines(node: GraphNode): string[] {
    const lines: string[] = [];
    const seen = new Set<string>();
    const edges = outgoing.get(node.id) ?? [];
    for (const type of ['IMPORTS', 'CALLS', 'REFERENCES'] as EdgeType[]) {
      for (const edge of edges) {
        if (edge.type !== type) continue;
        const target = nodeById.get(edge.to);
        if (!target) continue;
        const line = `${type} -> ${target.type === 'file' ? target.file : target.name}`;
        if (!seen.has(line)) {
          seen.add(line);
          lines.push(line);
        }
      }
    }
    if (lines.length > MAX_RELATION_LINES) {
      const extra = lines.length - MAX_RELATION_LINES;
      return [...lines.slice(0, MAX_RELATION_LINES), `... +${extra} more`];
    }
    return lines;
  }

  /** Returns the formatted block, or null if the source cannot be read. */
  function formatBlock(item: Item): string | null {
    const { node } = item;
    const lines = readLines(node.file);
    if (!lines || node.startLine > lines.length) return null;

    const source = lines.slice(node.startLine - 1, node.endLine).join('\n');
    const lang = FENCE_LANG[path.extname(node.file).toLowerCase()] ?? '';
    const relations = relationLines(node);

    return (
      `\n${item.title}:\n` +
      `Path: ${node.file}\n` +
      `Symbol: ${node.name} (${node.type})\n` +
      `Lines: ${node.startLine}-${node.endLine}\n` +
      (relations.length > 0 ? `Relations:\n${relations.join('\n')}\n` : 'Relations: none\n') +
      '```' + lang + '\n' +
      source + '\n' +
      '```\n'
    );
  }

  let question = input.question.trim();
  if (question.length > MAX_QUESTION_CHARS) question = question.slice(0, MAX_QUESTION_CHARS) + '...';

  const header =
    `[CG-CONTEXT]\n\nQuestion:\n${question}\n` +
    (input.tests.length > 0 ? `\nRelated tests: ${input.tests.join(', ')}\n` : '');
  const footer = '\n[/CG-CONTEXT]\n';

  const items: Item[] = [
    ...input.seeds.map((node): Item => ({ node, title: 'Selected node', isSeed: true })),
    ...input.related.map((r): Item => ({ node: r.node, title: `Related node (${r.reason})`, isSeed: false })),
  ];

  let remaining = budget - header.length - footer.length;
  let body = '';
  let includedSeeds = 0;
  let includedRelated = 0;
  const skipped: string[] = [];
  const includedNodes: GraphNode[] = [];

  for (const item of items) {
    const block = formatBlock(item);
    const label = `${item.node.file}:${item.node.name}`;
    if (block === null) {
      skipped.push(`${label} (source not found, run "cg index" again)`);
      continue;
    }
    if (block.length > remaining) {
      skipped.push(`${label} (${block.length} characters, over budget)`);
      continue; // skip this slice and try the next one
    }
    body += block;
    remaining -= block.length;
    includedNodes.push(item.node);
    if (item.isSeed) includedSeeds++;
    else includedRelated++;
  }

  const text = header + body + footer;
    return { text, chars: text.length, includedSeeds, includedRelated, skipped, includedNodes };
}