import * as fs from 'fs';
import * as path from 'path';

export const EXPECTED_CASE_COUNT = 150;
export const EXPECTED_PER_CATEGORY = 10;

export interface BenchRepository {
  name: string;
  path: string; // relative to the dataset file's folder
}

export interface BenchCase {
  id: string;
  category: string;
  repository: string;
  question: string;
  expected: string[]; // "file:Symbol" or just "file"
}

export interface Dataset {
  file: string;
  baseDir: string;
  repositories: BenchRepository[];
  cases: BenchCase[];
  uniqueIds: number;
  categories: string[];
  warnings: string[];
}

export function loadDataset(file: string): Dataset {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) {
    throw new Error(`Dataset file not found: ${file}. Run "node benchmarks/generate.js" first.`);
  }

  const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (!raw || !Array.isArray(raw.repositories) || !Array.isArray(raw.cases)) {
    throw new Error('Dataset must contain "repositories" and "cases" arrays.');
  }

  const repositories: BenchRepository[] = raw.repositories;
  const cases: BenchCase[] = raw.cases;
  const warnings: string[] = [];
  const repoNames = new Set(repositories.map((r) => r.name));
  const ids = new Set<string>();

  for (const c of cases) {
    if (!c.id || !c.category || !c.repository || !c.question || !Array.isArray(c.expected)) {
      throw new Error(`Invalid case (needs id, category, repository, question, expected[]): ${JSON.stringify(c).slice(0, 120)}`);
    }
    if (ids.has(c.id)) warnings.push(`Duplicate case id: ${c.id}`);
    ids.add(c.id);
    if (!repoNames.has(c.repository)) warnings.push(`Case ${c.id} uses unknown repository "${c.repository}"`);
  }

  const categories = Array.from(new Set(cases.map((c) => c.category)));
  if (ids.size !== EXPECTED_CASE_COUNT) {
    warnings.push(`WARNING: expected exactly ${EXPECTED_CASE_COUNT} unique case IDs, found ${ids.size}.`);
  }
  for (const category of categories) {
    const count = cases.filter((c) => c.category === category).length;
    if (count !== EXPECTED_PER_CATEGORY) {
      warnings.push(`WARNING: category ${category} has ${count} cases (expected ${EXPECTED_PER_CATEGORY}).`);
    }
  }

  return { file: full, baseDir: path.dirname(full), repositories, cases, uniqueIds: ids.size, categories, warnings };
}