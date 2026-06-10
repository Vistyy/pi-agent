import type { ForkEffort } from "../core/types.js";

const SHARED_REPORT_RULES = `
You are the fork child. Investigate independently and return a report the parent can act on.

Rules:
- Stay within the task scope.
- Do not modify files, run formatters, or commit unless the task explicitly asks for implementation.
- Prefer concrete evidence: files, code paths, commands, config keys, outputs, or observed behavior.
- If evidence is missing, uncertain, or you could not inspect something, say so.
- Do not make decisions outside the delegated task; report findings for the parent to decide.
`;

const EFFORT_EXPECTATIONS: Record<ForkEffort, string> = {
  fast: `
Effort expectation: fast.
Explore and find the concrete answer. Little judgment should be required.
Keep the report focused: answer, evidence/source, and only important caveats.
`,

  balanced: `
Effort expectation: balanced.
Investigate and think through the bounded task. This is normal triage, explanation, verification, review, or simplification.
Return a useful verdict with key evidence, reasoning, uncertainty, and a next step if one follows.
`,

  deep: `
Effort expectation: deep.
Challenge the area thoroughly. This is for second opinions, important changes, risky areas, debugging, final review, or when balanced work was insufficient.
Look for missed problems, failure modes, counterarguments, edge cases, and confidence limits.
`,
};

export function buildForkTaskPrompt(task: string, effort: ForkEffort = "balanced"): string {
  return `${task}\n${SHARED_REPORT_RULES}\n${EFFORT_EXPECTATIONS[effort] ?? EFFORT_EXPECTATIONS.balanced}`;
}
