import * as fs from 'fs';
import * as path from 'path';

export const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
  '.cg',
]);

const IGNORED_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

// Files bigger than this are almost always generated/bundled code, so we skip them.
const MAX_FILE_BYTES = 1000000;

function listDir(dir: string) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Walks the project and returns relative file paths (always with forward slashes),
 * e.g. "src/routes/auth.ts". Only .js/.jsx/.ts/.tsx files are returned.
 */
export function scanProject(root: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    for (const entry of listDir(dir)) {
      if (entry.isSymbolicLink()) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (IGNORED_FILES.has(entry.name)) continue;
      if (entry.name.endsWith('.min.js')) continue;
      if (!SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      try {
        if (fs.statSync(fullPath).size > MAX_FILE_BYTES) continue;
      } catch {
        continue;
      }

      results.push(path.relative(root, fullPath).split(path.sep).join('/'));
    }
  }

  walk(root);
  return results.sort();
}