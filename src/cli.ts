#!/usr/bin/env node
import { runIndex } from './commands/index';
import { runInspect } from './commands/inspect';
import { runContext } from './commands/context';
import { runAsk } from './commands/ask';
import { runBenchmark } from './commands/benchmark';
import { runResults } from './commands/results';
import { runWebDashboard } from './commands/web';
import { runHistory } from './commands/history';

const VERSION = '0.2.0';

function printHelp(): void {
  console.log(`cg ${VERSION} - local code graph and compact context for JS/TS projects (model-agnostic)

Usage:
  cg index                          Scan the current project and write .cg/index.json
  cg inspect <symbol>               Show a symbol's location, relations and source code
  cg context "<question>"           Compact context packet + metrics
                                    (--budget N, --depth 0|1|2, --adaptive, --trace, --explain)
  cg ask "<question>"               Offline: context packet + compact-response prompt (no model is called)
                                    (--out prompt.txt, --check reply.txt, plus the context options)
  cg ask --check <file>             Validate a saved model reply (never edits it)
  cg benchmark                      Run the benchmark (--file benchmarks/cases.json, --budget N)
  cg results                        Show the latest benchmark results
  cg dashboard                      Local web dashboard (--port N, --no-open)
  cg dashboard --terminal           Previous terminal dashboard of the latest results
  cg history                        List recorded benchmark runs
  cg --help | --version`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'index':
      await runIndex();
      break;
    case 'inspect':
      runInspect(rest[0]);
      break;
    case 'context':
      runContext(rest);
      break;
    case 'ask':
      runAsk(rest);
      break;
    case 'benchmark':
      await runBenchmark(rest);
      break;
    case 'results':
      runResults();
      break;
    case 'dashboard':
      await runWebDashboard(rest);
      break;
    case 'history':
      runHistory();
      break;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    case '--version':
    case '-v':
      console.log(VERSION);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});