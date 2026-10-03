// The compact-response policy. It is only text and stays separate from retrieval code.
// Model-neutral: the same prompt can be pasted into Claude, ChatGPT, Gemini or another model.

export const COMPACT_POLICY = `You are operating under cg-cli compact mode.

Use only the supplied CG-CONTEXT as repository evidence.

If evidence is insufficient, write:
Need: <exact file or symbol>

Do not greet.
Do not apologize.
Do not restate the request.
Do not explain your process.

Return exactly:

Answer: <direct answer>
Evidence: <key code/symbol evidence>
Action: <recommended action or None>
Risk: <important risk or None>

Keep it short. Put any code or diff inside a fenced code block.`;

/** Policy first, then the context packet. The question is already inside the packet. */
export function buildPrompt(packetText: string): string {
  return `${COMPACT_POLICY}\n\n${packetText}`;
}


/** The reusable model-neutral prompt shown by the dashboard (same four sections the validator checks). */
export const CAVEMAN_PROMPT = `You are answering a developer question using the supplied repository context.

Respond only in this format:

Answer: <direct answer>
Evidence: <specific code/symbol evidence>
Action: <required action or None>
Risk: <important risk or None>

Rules:
- Be concise.
- No greeting.
- No unnecessary introduction.
- No repetition.
- Do not remove technically important information.
- Include exact commands or code when required.
- If the context is insufficient, explicitly write:
  Need: <exact file or symbol>
- Do not invent repository details.`;