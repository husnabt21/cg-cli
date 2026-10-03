import { PipelineResult } from './pipeline';

/** Explains WHY each node is in the context: seed score reasons or the graph edge that led to it. */
export function formatTrace(result: PipelineResult): string {
  const included = new Set(result.packet.includedNodes.map((n) => n.id));
  const mark = (id: string): string => (included.has(id) ? '' : '   [not in packet: over budget]');

  const lines: string[] = [`Retrieval trace (expansion depth ${result.confidence.finalDepth}):`];
  for (const seed of result.seeds) {
    lines.push(`${seed.node.file}:${seed.node.name}${mark(seed.node.id)}`);
    lines.push(`  reason: seed - ${seed.reasons.join('; ') || 'matched'} (score ${seed.score})`);
  }
  for (const rel of result.expansion.related) {
    lines.push(`${rel.node.file}:${rel.node.name}${mark(rel.node.id)}`);
    lines.push(`  reason: ${rel.reason}`);
  }
  return lines.join('\n');
}