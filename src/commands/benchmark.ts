import { Dataset, loadDataset } from '../bench/dataset';
import { executeBenchmark, VARIANTS } from '../bench/runner';
import { appendRun } from '../bench/store';
import { printRunResults } from './results';
import { parseArgs } from './args';

export async function runBenchmark(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.error) {
    console.error(parsed.error);
    process.exitCode = 1;
    return;
  }

  const file = parsed.file ?? 'benchmarks/cases.json';
  let dataset: Dataset;
  try {
    dataset = loadDataset(file);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  console.log('[cg-cli benchmark]');
  console.log(`Dataset: ${file}`);
  console.log(`Total test cases: ${dataset.cases.length}`);
  console.log(`Unique case IDs: ${dataset.uniqueIds}`);
  console.log(`Categories: ${dataset.categories.length}`);
  console.log(`Repositories/projects: ${dataset.repositories.length}`);
  for (const warning of dataset.warnings) console.log(`[cg-cli] ${warning}`);
  console.log('Measures repository context reduction and retrieval recall only (no model is called).');
  console.log(`Variants: ${VARIANTS.map((v) => v.label).join(' | ')}`);
  console.log(`Budget per case: ${parsed.budget} characters\n`);
  console.log('Indexing repositories...');

  const run = await executeBenchmark(dataset, parsed.budget, (message) => console.log(message));
  appendRun(run);

  console.log(`\nResults saved: ${run.runId} (benchmarks/results/runs.json)\n`);
  printRunResults(run);
}