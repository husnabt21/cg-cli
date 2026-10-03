import { loadStore } from '../bench/store';
import { PRIMARY_VARIANT, aggregate, byCategory, fmtNum, fmtPct, labelFor } from '../bench/summary';

function bar(pct: number | null, width = 20): string {
  if (pct === null) return '.'.repeat(width);
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  return '#'.repeat(filled) + '.'.repeat(width - filled);
}

export function runDashboard(): void {
  const store = loadStore();
  if (store.runs.length === 0) {
    console.log('No benchmark results recorded yet. Run "cg benchmark" first.');
    return;
  }

  const run = store.runs[store.runs.length - 1];
  const primary = run.records.filter((r) => r.variant === PRIMARY_VARIANT);
  const agg = aggregate(primary);
  const categories = new Set(primary.map((r) => r.category)).size;

  console.log('==============================================');
  console.log(' CG-CLI BENCHMARK DASHBOARD');
  console.log('==============================================');
  console.log(`Run: ${run.runId}`);
  console.log(`Cases: ${agg.total}   Categories: ${categories}   Repositories: ${run.repositories.length}`);
  console.log(`Evaluated: ${agg.evaluated}   Data errors: ${agg.dataErrors}   No match: ${agg.noMatch}`);
  console.log('');
  console.log(`Average context reduction:               ${fmtPct(agg.reduction)}`);
  console.log(`Average retrieval recall:                ${fmtPct(agg.recall)}`);
  console.log(`Average baseline context units (files):  ${fmtNum(agg.baselineUnits)}`);
  console.log(`Average selected context units (slices): ${fmtNum(agg.selectedUnits)}`);

  console.log('\nCategory performance (bar = retrieval recall, one-hop)');
  for (const row of byCategory(primary)) {
    console.log(
      `${row.label.padEnd(27)} [${bar(row.agg.recall)}] ${fmtPct(row.agg.recall).padStart(6)}   reduction ${fmtPct(row.agg.reduction)}`
    );
  }

  console.log('\nExpansion variants (recall bar)');
  for (const variant of run.variants) {
    const a = aggregate(run.records.filter((r) => r.variant === variant.id));
    console.log(`${variant.label.padEnd(30)} [${bar(a.recall)}] ${fmtPct(a.recall).padStart(6)}   avg chars ${fmtNum(a.selectedChars, 0)}`);
  }

  console.log('\nRecent benchmark cases (one-hop)');
  for (const r of primary.slice(-10)) {
    const recall = r.status === 'data_error' ? 'data error' : fmtPct(r.recallPct);
    console.log(
      `  ${r.caseId.padEnd(8)} ${labelFor(r.category).padEnd(27)} recall ${recall.padStart(7)}   reduction ${fmtPct(r.reductionPct).padStart(7)}   nodes ${r.selectedNodes}`
    );
  }

  console.log('\nAll values come from the recorded benchmark run. Tokens are estimates (chars / 4).');
}