import * as fs from 'fs';
import * as path from 'path';
import { CgIndex } from '../indexer/graph';
import { NormalizedQuery, normalizeQuery } from './query';
import { ScoredNode, rankNodes, selectSeeds } from './rank';
import { Expansion, expandGraph } from './expand';
import { PacketResult, buildPacket } from './packet';
import { ConfidenceLog, retrievalConfidence } from './confidence';

export const ADAPTIVE_THRESHOLD = 0.6; // heuristic, not calibrated
export const MAX_DEPTH = 2;

export interface PipelineOptions {
  budget: number;
  depth: number; // 0, 1 or 2
  adaptive: boolean; // if confidence is low, add one more hop (max depth 2)
}

export interface PipelineResult {
  query: NormalizedQuery;
  ranked: ScoredNode[];
  seeds: ScoredNode[];
  expansion: Expansion;
  packet: PacketResult;
  confidence: ConfidenceLog;
}

export function loadIndex(root: string): CgIndex | null {
  const indexPath = path.join(root, '.cg', 'index.json');
  if (!fs.existsSync(indexPath)) return null;
  return JSON.parse(fs.readFileSync(indexPath, 'utf8')) as CgIndex;
}

/** question -> normalize -> rank -> seeds -> graph expansion -> packet. Null if nothing matches. */
export function runPipeline(
  index: CgIndex,
  root: string,
  question: string,
  options: PipelineOptions
): PipelineResult | null {
  const query = normalizeQuery(question);
  const ranked = rankNodes(index, query);
  if (ranked.length === 0) return null;

  const seeds = selectSeeds(ranked, 3);
  const scoreById = new Map<string, number>(
    ranked.map((r: ScoredNode): [string, number] => [r.node.id, r.score])
  );

  const confidenceOf = (e: Expansion): number =>
    retrievalConfidence(query, [...seeds.map((s: ScoredNode) => s.node), ...e.related.map((r) => r.node)]);

  let depth = options.depth;
  let expansion = expandGraph(index, seeds, scoreById, depth);
  const initial = confidenceOf(expansion);
  let final = initial;
  let expanded = false;

  if (options.adaptive && initial < ADAPTIVE_THRESHOLD && depth < MAX_DEPTH) {
    depth += 1;
    expansion = expandGraph(index, seeds, scoreById, depth);
    final = confidenceOf(expansion);
    expanded = true;
  }

  const packet = buildPacket({
    question,
    root,
    index,
    seeds: seeds.map((s: ScoredNode) => s.node),
    related: expansion.related,
    tests: expansion.tests,
    budget: options.budget,
  });

  return { query, ranked, seeds, expansion, packet, confidence: { initial, final, expanded, finalDepth: depth } };
}