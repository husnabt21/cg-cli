import { normalizeQuery } from '../retrieval/query';
import { loadIndex, runPipeline } from '../retrieval/pipeline';
import { formatTrace } from '../retrieval/trace';
import { formatConfidence } from '../retrieval/confidence';
import { computeMetrics, formatMetrics } from '../metrics/metrics';
import { parseArgs } from './args';

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

export function runContext(args: string[]): void {
  const parsed = parseArgs(args);
  if (parsed.error) return fail(parsed.error);
  if (!parsed.question) {
    return fail(
      'Usage: cg context "<question>" [--budget N] [--depth 0|1|2] [--adaptive] [--trace] [--explain]'
    );
  }

  const root = process.cwd();
  const index = loadIndex(root);
  if (!index) return fail('No index found (.cg/index.json). Run "cg index" first.');

  const result = runPipeline(index, root, parsed.question, {
    budget: parsed.budget,
    depth: parsed.depth,
    adaptive: parsed.adaptive,
  });
  if (!result) {
    const terms = normalizeQuery(parsed.question).terms;
    return fail(
      `No relevant code found. Search terms used: ${terms.join(', ') || '(none)'}.\n` +
        'Try including a function name, file name or other specific word from your code.'
    );
  }

  if (parsed.explain) {
    console.error('--- explain ---');
    console.error(`terms: ${result.query.terms.join(', ') || '(none)'}`);
    console.error(`error intent: ${result.query.errorIntent}, test intent: ${result.query.testIntent}`);
    console.error('top candidates:');
    for (const r of result.ranked.slice(0, 10)) {
      console.error(
        `  ${String(r.score).padStart(3)}  ${r.node.type.padEnd(8)} ${r.node.file}:${r.node.name}  [${r.reasons.join('; ')}]`
      );
    }
    console.error('--- end explain ---\n');
  }
  if (parsed.trace) console.error(formatTrace(result) + '\n');

  // The packet goes to stdout; metrics and notes go to stderr.
  console.log(result.packet.text);

  const metrics = computeMetrics(root, index, parsed.question, result.seeds.map((s) => s.node), result.packet);
  console.error('\n' + formatMetrics(metrics));
  console.error(formatConfidence(result.confidence));

  if (result.packet.skipped.length > 0) {
    console.error(`Skipped ${result.packet.skipped.length} slice(s):`);
    for (const s of result.packet.skipped) console.error(`  - ${s}`);
    console.error('Use --budget <number> for a larger budget.');
  }
}