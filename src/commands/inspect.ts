import * as fs from 'fs';
import * as path from 'path';
import { CgIndex, EdgeType, GraphEdge, GraphNode } from '../indexer/graph';

const EDGE_ORDER: EdgeType[] = ['CONTAINS', 'IMPORTS', 'EXPORTS', 'CALLS', 'REFERENCES'];

const FENCE_LANG: Record<string, string> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
};

function findMatches(index: CgIndex, query: string): GraphNode[] {
  const lower = query.toLowerCase();

  // Try the most exact match first, then looser ones.
  const levels: Array<(n: GraphNode) => boolean> = [
    (n) => n.id === query || `${n.file}:${n.name}` === query || (n.type === 'file' && n.file === query),
    (n) => n.name === query || (n.type === 'method' && n.name.endsWith('.' + query)),
    (n) =>
      n.name.toLowerCase() === lower || (n.type === 'method' && n.name.toLowerCase().endsWith('.' + lower)),
  ];

  for (const test of levels) {
    let hits = index.nodes.filter(test);
    if (hits.length > 1) {
      const preferred = hits.filter((n) => n.type !== 'file' && !n.module);
      if (preferred.length > 0) hits = preferred;
    }
    if (hits.length > 0) return hits;
  }
  return [];
}

function label(target: GraphNode, from: GraphNode): string {
  if (target.type === 'file') return target.file;
  if (target.module) {
    return target.module === target.name ? target.name : `${target.name} (${target.module})`;
  }
  if (target.file !== from.file) return `${target.name} (${target.file})`;
  return target.name;
}

function sortEdges(list: GraphEdge[]): GraphEdge[] {
  return [...list].sort((a, b) => EDGE_ORDER.indexOf(a.type) - EDGE_ORDER.indexOf(b.type));
}

function readSource(root: string, node: GraphNode): string[] {
  if (node.type === 'file') {
    return ['(This is a file node. Inspect a function or class inside it to see its code.)'];
  }
  if (node.module) {
    return [`(External symbol from "${node.module}" - there is no local source code.)`];
  }

  const fullPath = path.join(root, node.file);
  if (!fs.existsSync(fullPath)) {
    return [`(File not found: ${node.file}. Run "cg index" again.)`];
  }

  const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
  if (node.startLine > lines.length) {
    return [`(The file is now shorter than the index expects. Run "cg index" again.)`];
  }
  return lines.slice(node.startLine - 1, node.endLine);
}

export function runInspect(query: string | undefined): void {
  if (!query) {
    console.error('Usage: cg inspect <symbol>');
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const indexPath = path.join(root, '.cg', 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('No index found (.cg/index.json). Run "cg index" first.');
    process.exitCode = 1;
    return;
  }

  const index: CgIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const matches = findMatches(index, query);

  if (matches.length === 0) {
    console.error(`No symbol named "${query}" found in the index.`);
    process.exitCode = 1;
    return;
  }

  if (matches.length > 1) {
    console.log(`Multiple symbols match "${query}":`);
    for (const m of matches) {
      console.log(`  ${m.type.padEnd(8)} ${m.file}:${m.startLine}-${m.endLine}   id: ${m.id}`);
    }
    console.log('');
    console.log(`Be more specific, for example: cg inspect ${matches[0].file}:${matches[0].name}`);
    return;
  }

  const node = matches[0];
  const nodeById = new Map<string, GraphNode>(index.nodes.map((n): [string, GraphNode] => [n.id, n]));

  const outgoing = sortEdges(index.edges.filter((e) => e.from === node.id));
  const incoming = sortEdges(index.edges.filter((e) => e.to === node.id));

  console.log(`Symbol: ${node.name}`);
  console.log(`Type: ${node.type}`);
  console.log(`File: ${node.module ? `(external module: ${node.module})` : node.file}`);
  if (!node.module) console.log(`Lines: ${node.startLine}-${node.endLine}`);

  console.log('');
  console.log('Relations:');
  if (outgoing.length === 0) console.log('  (none)');
  for (const edge of outgoing) {
    const target = nodeById.get(edge.to);
    if (!target) continue;
    const suffix = edge.type === 'CONTAINS' ? ` [${target.type}]` : '';
    console.log(`  ${edge.type} -> ${label(target, node)}${suffix}`);
  }

  console.log('');
  console.log('Used by:');
  if (incoming.length === 0) console.log('  (none)');
  for (const edge of incoming) {
    const source = nodeById.get(edge.from);
    if (!source) continue;
    console.log(`  ${edge.type} <- ${label(source, node)}`);
  }

  console.log('');
  console.log('Source:');
  const lang = FENCE_LANG[path.extname(node.file).toLowerCase()] ?? '';
  const isCode = node.type !== 'file' && !node.module;
  if (isCode) console.log('```' + lang);
  console.log(readSource(root, node).join('\n'));
  if (isCode) console.log('```');
}