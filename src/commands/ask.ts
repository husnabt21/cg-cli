import * as fs from 'fs';
import * as path from 'path';
import { loadIndex, runPipeline } from '../retrieval/pipeline';
import { formatConfidence } from '../retrieval/confidence';
import { computeMetrics, formatMetrics } from '../metrics/metrics';
import { buildPrompt } from '../policy/compact';
import { validateResponse, MAX_PROSE_WORDS } from '../validation/validator';
import { parseArgs } from './args';

function fail(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

/** Validates a manually saved model reply. The file is only read, never modified. */
function checkResponse(checkFile: string): void {
  const file = path.resolve(process.cwd(), checkFile);
  if (!fs.existsSync(file)) return fail(`File not found: ${checkFile}`);

  const result = validateResponse(fs.readFileSync(file, 'utf8'));
  if (result.warnings.length === 0) {
    console.error(
      `[cg-cli] Response follows the compact format (${result.proseWords} prose words; target <=${MAX_PROSE_WORDS}).`
    );
  } else {
    for (const warning of result.warnings) console.error(warning);
    console.error('[cg-cli] The response file was not modified.');
  }
}

export function runAsk(args: string[]): void {
  const parsed = parseArgs(args);
  if (parsed.error) return fail(parsed.error);

  // cg ask --check reply.txt  (validate only)
  if (parsed.checkFile && !parsed.question) return checkResponse(parsed.checkFile);

  if (!parsed.question) {
    return fail(
      'Usage: cg ask "<question>" [--out prompt.txt] [--budget N] [--depth 0|1|2] [--adaptive]\n' +
        '       cg ask "<question>" --check reply.txt\n' +
        '       cg ask --check reply.txt'
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
    return fail('No relevant code found for this question. Try naming a function, file or other specific word.');
  }

  const metrics = computeMetrics(root, index, parsed.question, result.seeds.map((s) => s.node), result.packet);

  // cg ask "<question>" --check reply.txt  (retrieval metrics + validation of a manual reply)
  if (parsed.checkFile) {
    console.error('[cg-cli] Checking a manually saved model reply. No model is called.');
    console.error('\n' + formatMetrics(metrics));
    console.error(formatConfidence(result.confidence) + '\n');
    return checkResponse(parsed.checkFile);
  }

  const prompt = buildPrompt(result.packet.text);

  console.error('[cg-cli] Offline mode: no model is called.');
  console.error('[cg-cli] Context generation complete.');
  console.error('[cg-cli] Compact response policy prepared.');

  if (parsed.out) {
    fs.writeFileSync(path.resolve(root, parsed.out), prompt, 'utf8');
    console.error(`[cg-cli] Prompt saved to ${parsed.out} (${prompt.length} characters).`);
  } else {
    console.log(prompt);
  }

  console.error('\n' + formatMetrics(metrics));
  console.error(formatConfidence(result.confidence));
  console.error('\nNext: paste the prompt into Claude web, ChatGPT, Gemini or another model, save its reply');
  console.error('to a file, then check it with:');
  console.error(`  cg ask "${parsed.question}" --check reply.txt`);
}