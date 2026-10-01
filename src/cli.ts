#!/usr/bin/env node
import { runIndex } from './commands/index';
import { runInspect } from './commands/inspect';

const VERSION = '0.1.0';

function printHelp(): void {
  console.log(`cg ${VERSION} - local code graph for JS/TS projects

Usage:
  cg index              Scan the current project and write .cg/index.json
  cg inspect <symbol>   Show a symbol's location, relations and source code
  cg --help             Show this help
  cg --version          Show the version`);
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