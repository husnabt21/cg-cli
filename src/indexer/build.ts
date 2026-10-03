import * as fs from 'fs';
import * as path from 'path';
import { scanProject } from './scan';
import { CodeParser } from './parser';
import { buildGraph, CgIndex, IndexedFile } from './graph';

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
};

let sharedParser: CodeParser | null = null;

/** Same steps as `cg index`, but quiet and reusable. Writes <root>/.cg/index.json. */
export async function indexProject(root: string): Promise<{ index: CgIndex; failures: string[] }> {
  if (!sharedParser) sharedParser = await CodeParser.create();
  const parser = sharedParser;

  const files: IndexedFile[] = [];
  const failures: string[] = [];

  for (const relPath of scanProject(root)) {
    try {
      const source = fs.readFileSync(path.join(root, relPath), 'utf8');
      files.push({
        path: relPath,
        language: LANGUAGE_BY_EXT[path.extname(relPath).toLowerCase()] ?? 'unknown',
        lineCount: source.split(/\r?\n/).length,
        parsed: parser.parse(relPath, source),
      });
    } catch (err) {
      failures.push(`${relPath} (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  const index = buildGraph(root, files);
  fs.mkdirSync(path.join(root, '.cg'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cg', 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  return { index, failures };
}