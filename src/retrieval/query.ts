// Turns a natural-language question into search terms. No AI involved: only string rules.

export interface NormalizedQuery {
  original: string;
  terms: string[]; // lowercase words and identifier parts, e.g. "verifyToken" -> verify, token
  rawTokens: Set<string>; // whole identifiers as typed, lowercase, e.g. "verifytoken"
  pathHints: string[]; // things that look like paths, e.g. "routes/auth.ts"
  related: string[]; // heuristic helper words that are NOT in the question (see RELATED below)
  errorIntent: boolean; // the question sounds like a bug / failure
  testIntent: boolean; // the question mentions tests
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did',
  'why', 'how', 'what', 'when', 'where', 'which', 'who', 'this', 'that', 'these', 'those',
  'it', 'its', 'of', 'to', 'in', 'on', 'at', 'for', 'from', 'by', 'with', 'without', 'and',
  'or', 'but', 'not', 'no', 'if', 'then', 'else', 'so', 'as', 'into', 'over', 'under', 'about',
  'can', 'could', 'should', 'would', 'will', 'may', 'might', 'must', 'me', 'my', 'we', 'our',
  'you', 'your', 'they', 'their', 'there', 'here', 'please', 'help', 'fix', 'show', 'explain',
  'tell', 'make', 'doesn', 'don', 'isn', 'didn', 'won', 'work', 'working',
  'works', 'wrong', 'function', 'method', 'class', 'file', 'code', 'ts', 'tsx', 'js', 'jsx',
]);

const ERROR_WORDS = new Set([
  'error', 'errors', 'fail', 'fails', 'failing', 'failed', 'failure', 'bug', 'broken',
  'crash', 'crashes', 'exception', 'throw', 'throws', 'invalid', 'unauthorized',
  'forbidden', 'denied',
]);

const TEST_WORDS = new Set(['test', 'tests', 'testing', 'spec', 'specs', 'jest', 'vitest', 'mocha']);

// Small hand-written table: if the question contains the key, these words are also worth
// looking for. They score lower than words the user actually typed. Edit freely.
const RELATED: Record<string, string[]> = {
  auth: ['login', 'token', 'jwt', 'session', 'verify', 'password'],
  authentication: ['login', 'token', 'jwt', 'session', 'verify', 'password'],
  authorization: ['permission', 'token', 'verify', 'role'],
  login: ['auth', 'token', 'password', 'session'],
  jwt: ['token', 'verify', 'sign', 'auth'],
  token: ['jwt', 'verify', 'auth'],
  '401': ['unauthorized', 'auth', 'token', 'login'],
  '403': ['forbidden', 'permission', 'auth'],
  '404': ['route', 'handler'],
  '500': ['error', 'handler'],
  db: ['query', 'model', 'connection'],
  database: ['query', 'model', 'connection'],
  route: ['handler', 'controller', 'request', 'response'],
  router: ['handler', 'controller', 'request', 'response'],
  api: ['route', 'request', 'handler'],
};

/** "verifyJWTToken" -> ["verify", "jwt", "token"]; "src/auth_utils.ts" -> ["src", "auth", "utils", "ts"] */
export function splitIdentifier(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Very light stemming so "routes", "route" and "failing", "fail" can match. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

export function tokenMatches(term: string, token: string): boolean {
  const a = stem(term);
  const b = stem(token);
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
}

export function isTestFile(file: string): boolean {
  return /(^|\/)(__tests__|tests?|specs?)\//i.test(file) || /\.(test|spec)\.[jt]sx?$/i.test(file);
}

export function normalizeQuery(question: string, useRelated = false): NormalizedQuery {
  const original = question.trim();
  const tokens = original.match(/[A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)*/g) ?? [];

  const terms: string[] = [];
  const seen = new Set<string>();
  const rawTokens = new Set<string>();

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (!STOPWORDS.has(lower)) {
      rawTokens.add(lower);
      for (const segment of lower.split('.')) {
        if (segment && !STOPWORDS.has(segment)) rawTokens.add(segment);
      }
    }
    for (const part of splitIdentifier(token)) {
      if (part.length < 2 || STOPWORDS.has(part) || seen.has(part)) continue;
      seen.add(part);
      terms.push(part);
    }
  }

  const pathHints = original.replace(/\\/g, '/').toLowerCase().match(/[\w.\-]+(?:\/[\w.\-]+)+/g) ?? [];

  const lowerTokens = tokens.map((t) => t.toLowerCase());
  const errorIntent = lowerTokens.some((t) => ERROR_WORDS.has(t) || /^[45]\d\d$/.test(t));
  const testIntent = lowerTokens.some((t) => TEST_WORDS.has(t));

  const related: string[] = [];
  if (useRelated) {
    // Experimental and OFF by default: benchmark results must not depend on it.
    for (const term of terms) {
      for (const word of RELATED[term] ?? RELATED[stem(term)] ?? []) {
        if (!terms.includes(word) && !related.includes(word)) related.push(word);
      }
    }
  }

  return { original, terms, rawTokens, pathHints, related, errorIntent, testIntent };
}