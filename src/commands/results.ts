import { loadStore, RunRecord } from '../bench/store';
import { PRIMARY_VARIANT, aggregate, byCategory, fmtNum, fmtPct } from '../bench/summary';

export function printRunResults(run: RunRecord): void {
  const primary = run.records.filter((r) => r.variant === PRIMARY_VARIANT);
  const agg = aggregate(primary);
  const categories = new Set(primary.map((r) => r.category)).size;

  console.log('[cg-cli results]');
  console.log(`Run: ${run.runId}`);
  console.log(`Dataset: ${run.datasetFile}`);
  console.log(`Total cases: ${agg.total}`);
  console.log(`Categories: ${categories}`);
  console.log(`Repositories/projects: ${run.repositories.length}`);
  console.log(`Budget per case: ${run.budget} chars`);
  console.log(
    `Evaluated: ${agg.evaluated} (data/benchmark errors: ${agg.dataErrors}, no relevant node found: ${agg.noMatch})`
  );
  for (const r of primary.filter((x) => x.status === 'data_error').slice(0, 5)) {
    console.log(`  data error ${r.caseId}: ${r.error}`);
  }

  console.log('\nPrimary variant: seed + one-hop expansion');
  console.log(`Average context reduction:               ${fmtPct(agg.reduction)}`);
  console.log(`Average retrieval recall:                ${fmtPct(agg.recall)}`);
  console.log(`Average selected nodes:                  ${fmtNum(agg.selectedNodes)}`);
  console.log(`Average baseline context units (files):  ${fmtNum(agg.baselineUnits)}`);
  console.log(`Average selected context units (slices): ${fmtNum(agg.selectedUnits)}`);
  console.log(`Average baseline chars: ${fmtNum(agg.baselineChars, 0)}   Average selected chars: ${fmtNum(agg.selectedChars, 0)}`);
  console.log(
    `Expected symbols: ${agg.expected}; retrieved into the packet: ${agg.hits}; ` +
      `missed (never retrieved): ${agg.missedNotRetrieved}; missed (over budget): ${agg.missedBudget}`
  );

  console.log('\nCategory                      Cases  Reduction   Recall');
  for (const row of byCategory(primary)) {
    console.log(
      `${row.label.padEnd(28)}${String(row.agg.total).padStart(7)}${fmtPct(row.agg.reduction).padStart(11)}${fmtPct(row.agg.recall).padStart(9)}`
    );
  }

  console.log('\nAblation (all cases, per expansion variant)');
  console.log('Variant                          Recall  Reduction  Avg selected chars  Avg nodes');
  for (const variant of run.variants) {
    const a = aggregate(run.records.filter((r) => r.variant === variant.id));
    console.log(
      `${variant.label.padEnd(33)}${fmtPct(a.recall).padStart(6)}${fmtPct(a.reduction).padStart(11)}${fmtNum(a.selectedChars, 0).padStart(20)}${fmtNum(a.selectedNodes).padStart(11)}`
    );
  }

  console.log('\nNotes:');
  console.log('- The benchmark measures repository context reduction and retrieval recall. It does not by itself');
  console.log('  prove end-to-end AI answer correctness or actual model tool-call reduction.');
  console.log('- Recall is measured against manually defined gold symbols. Tokens are ESTIMATES (chars / 4).');
  console.log('- Reduction can be negative when selected files are small; averages are plain means.');
}

export function runResults(): void {
  const store = loadStore();
  if (store.runs.length === 0) {
    console.log('No benchmark results recorded yet. Run "cg benchmark" first.');
    return;
  }
  printRunResults(store.runs[store.runs.length - 1]);
}