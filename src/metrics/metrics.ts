import * as fs from 'fs';
import * as path from 'path';
import { CgIndex, GraphNode } from '../indexer/graph';
import { PacketResult } from '../retrieval/packet';

const sizeCache = new Map<string, number>();

function fileChars(root: string, file: string): number {
  const full = path.join(root, file);
  const cached = sizeCache.get(full);
  if (cached !== undefined) return cached;
  let size = 0;
  try {
    size = fs.readFileSync(full, 'utf8').length;
  } catch {
    size = 0;
  }
  sizeCache.set(full, size);
  return size;
}

/** ESTIMATE only: characters / 4. This is not a real tokenizer count. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

export interface ContextMetrics {
  query: string;
  seeds: string[];
  selectedNodes: number;
  baselineChars: number;
  baselineFiles: number;
  selectedChars: number;
  reductionPct: number | null; // null when the baseline is 0 (nothing was selected)
  projectChars: number; // whole indexed project, reference only
}

/**
 * Baseline = full text of every distinct file that contains a node included in the packet.
 * Selected = the real length of the packet text (headers and metadata included).
 */
export function computeMetrics(
  root: string,
  index: CgIndex,
  question: string,
  seeds: GraphNode[],
  packet: PacketResult
): ContextMetrics {
  const files = Array.from(new Set(packet.includedNodes.map((n) => n.file)));
  const baselineChars = files.reduce((sum, f) => sum + fileChars(root, f), 0);
  const projectChars = index.files.reduce((sum, f) => sum + fileChars(root, f.path), 0);
  const selectedChars = packet.chars;

  return {
    query: question,
    seeds: seeds.map((n) => n.name),
    selectedNodes: packet.includedSeeds + packet.includedRelated,
    baselineChars,
    baselineFiles: files.length,
    selectedChars,
    reductionPct: baselineChars > 0 ? (1 - selectedChars / baselineChars) * 100 : null,
    projectChars,
  };
}

export function formatReduction(pct: number | null): string {
  return pct === null ? 'n/a' : `${pct.toFixed(1)}%`;
}

export function formatMetrics(m: ContextMetrics): string {
  const tokens = (chars: number): string => `~${estimateTokens(chars)} estimated tokens`;
  const query = m.query.length > 80 ? m.query.slice(0, 80) + '...' : m.query;

  return [
    '[cg-cli metrics]',
    `Query: ${query}`,
    `Seeds: ${m.seeds.join(', ') || '(none)'}`,
    `Selected nodes: ${m.selectedNodes}`,
    `Baseline context: ${m.baselineChars} chars (${tokens(m.baselineChars)})`,
    `Selected context: ${m.selectedChars} chars (${tokens(m.selectedChars)})`,
    `Estimated context reduction: ${formatReduction(m.reductionPct)}`,
    `Repository context units: baseline ${m.baselineFiles} file(s) vs selected ${m.selectedNodes} node slice(s)`,
    `Whole indexed project (reference only): ${m.projectChars} chars (${tokens(m.projectChars)})`,
    'Token figures are ESTIMATES (characters / 4), not real tokenizer counts.',
    'Context units are NOT AI tool-call counts.',
  ].join('\n');
}

