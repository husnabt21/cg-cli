import { DEFAULT_BUDGET } from '../retrieval/packet';

export interface ParsedArgs {
  question: string;
  budget: number;
  depth: number; // 0, 1 or 2
  adaptive: boolean;
  explain: boolean;
  trace: boolean;
  out: string | null;
  checkFile: string | null;
  file: string | null;
  error: string | null;
}

export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    question: '',
    budget: DEFAULT_BUDGET,
    depth: 1,
    adaptive: false,
    explain: false,
    trace: false,
    out: null,
    checkFile: null,
    file: null,
    error: null,
  };
  const words: string[] = [];

  let i = 0;
  const readValue = (inline: string | undefined): string | undefined => {
    if (inline !== undefined) return inline;
    i += 1;
    return args[i];
  };

  while (i < args.length) {
    const arg = args[i];
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);

    switch (flag) {
      case '--explain':
        result.explain = true;
        break;
      case '--trace':
        result.trace = true;
        break;
      case '--adaptive':
        result.adaptive = true;
        break;
      case '--budget': {
        const n = Number(readValue(inline));
        if (!Number.isInteger(n) || n < 200) {
          result.error = '--budget must be a whole number of at least 200 (characters).';
          return result;
        }
        result.budget = n;
        break;
      }
      case '--depth': {
        const n = Number(readValue(inline));
        if (!Number.isInteger(n) || n < 0 || n > 2) {
          result.error = '--depth must be 0, 1 or 2.';
          return result;
        }
        result.depth = n;
        break;
      }
      case '--out':
      case '--check':
      case '--file': {
        const value = readValue(inline);
        if (!value) {
          result.error = `${flag} needs a value.`;
          return result;
        }
        if (flag === '--out') result.out = value;
        else if (flag === '--check') result.checkFile = value;
        else result.file = value;
        break;
      }
      default:
        if (arg.startsWith('--')) {
          result.error = `Unknown option: ${arg}`;
          return result;
        }
        words.push(arg);
    }
    i += 1;
  }

  result.question = words.join(' ').trim();
  return result;
}