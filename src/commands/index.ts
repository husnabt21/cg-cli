import * as fs from 'fs';
import * as path from 'path';
import { scanProject } from '../indexer/scan';
import { CodeParser } from '../indexer/parser';
import { buildGraph, IndexedFile } from '../indexer/graph';

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
};

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function formatCounts(counts: Map<string, number>): string {
  return Array.from(counts.entries())
    .map(([name, count]) => `${name} ${count}`)
    .join(', ');
}

export async function runIndex(): Promise<void> {
  const root = process.cwd();
  const startedAt = Date.now();

  console.log(`Indexing ${root} ...`);

  const relPaths = scanProject(root);
  if (relPaths.length === 0) {
    console.log('No .js/.jsx/.ts/.tsx files found here. Run this inside a JavaScript/TypeScript project.');
    return;
  }

  const parser = await CodeParser.create();
  const indexedFiles: IndexedFile[] = [];
  const failures: string[] = [];

  for (const relPath of relPaths) {
    try {
      const source = fs.readFileSync(path.join(root, relPath), 'utf8');
      const parsed = parser.parse(relPath, source);
      indexedFiles.push({
        path: relPath,
        language: LANGUAGE_BY_EXT[path.extname(relPath).toLowerCase()] ?? 'unknown',
        lineCount: source.split(/\r?\n/).length,
        parsed,
      });
    } catch (err) {
      failures.push(`${relPath} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const index = buildGraph(root, indexedFiles);

  const outDir = path.join(root, '.cg');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log('');
  console.log('Index written to .cg/index.json');
  console.log(`  Files indexed : ${index.files.length}`);
  console.log(`  Nodes         : ${index.nodes.length} (${formatCounts(countBy(index.nodes, (n) => n.type))})`);
  console.log(`  Edges         : ${index.edges.length} (${formatCounts(countBy(index.edges, (e) => e.type))})`);
  console.log(`  Time          : ${seconds}s`);

  if (failures.length > 0) {
    console.log('');
    console.log(`Could not parse ${failures.length} file(s):`);
    for (const failure of failures.slice(0, 10)) console.log(`  - ${failure}`);
    if (failures.length > 10) console.log(`  ... and ${failures.length - 10} more`);
  }
}