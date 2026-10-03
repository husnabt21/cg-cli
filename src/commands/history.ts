import { loadStore } from '../bench/store';
import { PRIMARY_VARIANT, aggregate, fmtPct } from '../bench/summary';

export function runHistory(): void {
  const store = loadStore();
  if (store.runs.length === 0) {
    console.log('No benchmark results recorded yet. Run "cg benchmark" first.');
    return;
  }

  console.log('[cg-cli history] (one-hop variant)');
  console.log('Run                              Cases  Evaluated  Recall  Reduction  Data errors');
  for (const run of store.runs) {
    const a = aggregate(run.records.filter((r) => r.variant === PRIMARY_VARIANT));
    console.log(
      `${run.runId.padEnd(32)}${String(a.total).padStart(6)}${String(a.evaluated).padStart(11)}${fmtPct(a.recall).padStart(8)}${fmtPct(a.reduction).padStart(11)}${String(a.dataErrors).padStart(13)}`
    );
  }
}