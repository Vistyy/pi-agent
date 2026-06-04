import type { JudgeResult, Probe } from './types.js';
import { DEFAULT_MODEL, runPiSdk } from './pi.js';

export function judgePrompt(probe: Probe, answer: string): string {
  const passIf = probe.rubric?.pass_if ?? [];
  const failIf = probe.rubric?.fail_if ?? [];
  return `You are grading an eval answer. Use only the rubric. Be strict but semantic; do not require exact wording.\n\nRules:\n- Passing requires explicitly satisfying every Pass if item.\n- Do not infer omitted requirements from related wording.\n- Failing any Fail if item means failed.\n- If an answer is merely directionally related but omits a required decision/caveat, mark failed and list it in missing.\n\nQuestion:\n${probe.question}\n\nAnswer:\n${answer}\n\nPass if:\n${passIf.map((x) => `- ${x}`).join('\n')}\n\nFail if:\n${failIf.map((x) => `- ${x}`).join('\n')}\n\nReturn only JSON:\n{"passed": boolean, "reason": string, "missing": string[], "incorrect": string[]}`;
}

export function parseJudgeJson(text: string): JudgeResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`judge returned no JSON: ${text}`);
  return JSON.parse(m[0]) as JudgeResult;
}

export async function runJudge(probe: Probe, answer: string, model = DEFAULT_MODEL) {
  const run = await runPiSdk(judgePrompt(probe, answer), { model });
  try { return { run, judge: parseJudgeJson(run.stdout) }; }
  catch (e) {
    return { run, judge: { passed: false, reason: String(e), missing: [], incorrect: ['judge_parse_error'] } satisfies JudgeResult };
  }
}
