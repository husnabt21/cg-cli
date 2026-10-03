// Checks a model response against the compact policy. It only WARNS.
// It never edits, deletes or rewrites the response.

export const MAX_PROSE_WORDS = 120;

const SECTIONS = ['Answer', 'Evidence', 'Action', 'Risk'];
const GREETING = /^\W*(certainly|sure|of course|i['’]d be happy|i would be happy|happy to help|great question)\b/i;

export interface ValidationResult {
  proseWords: number;
  warnings: string[];
}

/** Removes fenced code blocks. An unclosed fence hides the rest of the text. */
function stripCodeBlocks(text: string): string {
  const kept: string[] = [];
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) kept.push(line);
  }
  return kept.join('\n');
}

export function countProseWords(text: string): number {
  const prose = stripCodeBlocks(text).replace(
    /^\s*[*_#>-]*\s*(Answer|Evidence|Action|Risk|Need)\s*[*_]*\s*:/gm,
    ''
  );
  return prose.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

function hasSection(prose: string, name: string): boolean {
  return new RegExp(`^\\s*[*_#>-]*\\s*${name}\\s*[*_]*\\s*:`, 'm').test(prose);
}

export function validateResponse(response: string): ValidationResult {
  const warnings: string[] = [];
  const prose = stripCodeBlocks(response);

  if (response.trim().length === 0) {
    return { proseWords: 0, warnings: ['[cg-cli] Compactness warning: empty response'] };
  }

  // "Need: <file or symbol>" is the allowed answer when evidence is insufficient.
  const isNeedAnswer = /^\s*[*_#>-]*\s*Need\s*[*_]*\s*:/m.test(prose);
  const present = SECTIONS.filter((s) => hasSection(prose, s));

  if (!(isNeedAnswer && present.length === 0)) {
    for (const section of SECTIONS) {
      if (!present.includes(section)) {
        warnings.push(`[cg-cli] Compactness warning: missing section: ${section}`);
      }
    }
  }

  const firstLine = prose.split('\n').find((l) => l.trim().length > 0) ?? '';
  const greeting = GREETING.exec(firstLine);
  if (greeting) {
    warnings.push(`[cg-cli] Compactness warning: response starts with a greeting ("${greeting[1]}")`);
  }

  const proseWords = countProseWords(response);
  if (proseWords > MAX_PROSE_WORDS) {
    warnings.push(`[cg-cli] Compactness warning: ${proseWords} prose words; target <=${MAX_PROSE_WORDS}`);
  }

  return { proseWords, warnings };
}


/** Which required sections are present (code blocks are ignored). */
export function sectionPresence(response: string): Record<string, boolean> {
  const prose = stripCodeBlocks(response);
  const result: Record<string, boolean> = {};
  for (const section of SECTIONS) result[section] = hasSection(prose, section);
  return result;
}

export function hasGreeting(response: string): boolean {
  const prose = stripCodeBlocks(response);
  const firstLine = prose.split('\n').find((l) => l.trim().length > 0) ?? '';
  return GREETING.test(firstLine);
}

export function isNeedAnswer(response: string): boolean {
  return /^\s*[*_#>-]*\s*Need\s*[*_]*\s*:/m.test(stripCodeBlocks(response));
}