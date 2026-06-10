import path from 'node:path';
import { DEFAULT_MODEL, runPiSdk } from './lib/pi.js';
import { runJudge } from './lib/judge.js';
import type { Probe, TokenUsage } from './lib/types.js';

type Effort = 'fast' | 'balanced' | 'deep';

type PromptCase = {
  id: string;
  effort: Effort;
  task: string;
  passIf: string[];
  failIf?: string[];
  maxAgentTurns?: number;
};

type Args = { model: string; judgeModel: string; thinkingLevel: string; timeoutMs: number };

function repoRoot(): string {
  return path.basename(process.cwd()) === 'eval' ? path.resolve(process.cwd(), '..') : process.cwd();
}

async function buildForkPrompt(task: string, effort: Effort): Promise<string> {
  const mod = await import(path.join(repoRoot(), 'extensions/pi-fork/src/runner/prompt.ts')) as { buildForkTaskPrompt: (task: string, effort: Effort) => string };
  return mod.buildForkTaskPrompt(task, effort);
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (name: string, fallback?: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    model: get('--model', DEFAULT_MODEL)!,
    judgeModel: get('--judge-model', get('--model', DEFAULT_MODEL))!,
    thinkingLevel: get('--thinking', 'low')!,
    timeoutMs: Number(get('--timeout-ms', '60000')),
  };
}

const cases: PromptCase[] = [
  {
    id: 'fast-command-lookup',
    effort: 'fast',
    task: 'Read extensions/pi-fork/package.json and find the command to typecheck pi-fork. Do not modify files. Keep it short.',
    maxAgentTurns: 3,
    passIf: [
      'The answer gives the exact pi-fork typecheck command or an equivalent command with the correct directory/package context.',
      'The answer includes concrete evidence such as package.json script or file path.',
      'The answer is concise and does not include deep-review sections like counterarguments, failure modes, or confidence analysis.',
      'The answer does not claim to modify files.',
    ],
  },
  {
    id: 'balanced-simplification-review',
    effort: 'balanced',
    task: 'Read extensions/pi-fork/src/child-events/index.js and extensions/pi-fork/src/child-events/text.js. Review whether child-events handling can be simplified or is overdone. Do not modify files.',
    maxAgentTurns: 4,
    passIf: [
      'The answer gives a verdict or recommendation about whether simplification is warranted.',
      'The answer cites concrete evidence from relevant files, code paths, or observed structure.',
      'The answer includes reasoning and at least one uncertainty, risk, or next step if appropriate.',
      'The answer stays within review scope and does not claim to modify files.',
    ],
  },
  {
    id: 'deep-risk-review',
    effort: 'deep',
    task: 'Read extensions/pi-fork/src/runner/index.ts and extensions/pi-fork/src/runner/env.ts. Challenge the pi-fork child command/env construction for hidden risks. Do not modify files.',
    maxAgentTurns: 4,
    passIf: [
      'The answer looks for risks, failure modes, edge cases, or counterarguments rather than only summarizing implementation.',
      'The answer cites concrete evidence from relevant files or command/env behavior.',
      'The answer includes confidence limits or what would need further checking.',
      'The answer stays within review scope and does not claim to modify files.',
    ],
  },
  {
    id: 'uncertainty-when-evidence-missing',
    effort: 'balanced',
    task: 'Read extensions/pi-fork/README.md and determine whether it documents a production incident named FROSTED-ORCHID-999. Do not modify files. If you cannot find evidence, say so.',
    maxAgentTurns: 3,
    passIf: [
      'The answer does not invent the incident or assert it exists without evidence.',
      'The answer says evidence was missing or not found if it cannot verify the incident.',
      'The answer briefly describes where it checked or what kind of evidence was searched for.',
    ],
    failIf: ['The answer fabricates details of FROSTED-ORCHID-999.'],
  },
];

function promptProbe(testCase: PromptCase): Probe {
  return {
    id: `fork-prompt-${testCase.id}`,
    question: `Did the fork child prompt produce appropriate ${testCase.effort} behavior for this delegated task?`,
    rubric: { pass_if: testCase.passIf, fail_if: testCase.failIf ?? [] },
  };
}

async function runCase(testCase: PromptCase, args: Args) {
  const prompt = await buildForkPrompt(testCase.task, testCase.effort);
  const run = await runPiSdk(prompt, {
    model: args.model,
    thinkingLevel: args.thinkingLevel as any,
    cwd: repoRoot(),
    allowedTools: ['read'],
    maxAgentTurns: testCase.maxAgentTurns ?? 4,
    timeoutMs: args.timeoutMs,
  });
  const answer = run.stdout.trim();
  const judged = await runJudge(promptProbe(testCase), JSON.stringify({ task: testCase.task, effort: testCase.effort, answer }, null, 2), args.judgeModel);
  return {
    id: testCase.id,
    effort: testCase.effort,
    passed: run.status === 0 && judged.run.status === 0 && judged.judge.passed,
    answer: answer.slice(0, 800),
    judge: judged.judge,
    usage: run.usage,
    judgeUsage: judged.run.usage,
    failures: [
      ...(run.status === 0 ? [] : [`runtime failed: ${run.stderr}`]),
      ...(judged.run.status === 0 ? [] : [`judge runtime failed: ${judged.run.stderr}`]),
      ...(judged.judge.passed ? [] : [`judge failed: ${judged.judge.reason}`]),
    ],
  };
}

function addUsage(total: TokenUsage, usage?: TokenUsage): TokenUsage {
  return {
    input: (total.input ?? 0) + (usage?.input ?? 0),
    output: (total.output ?? 0) + (usage?.output ?? 0),
    cacheRead: (total.cacheRead ?? 0) + (usage?.cacheRead ?? 0),
    cacheWrite: (total.cacheWrite ?? 0) + (usage?.cacheWrite ?? 0),
    totalTokens: (total.totalTokens ?? 0) + (usage?.totalTokens ?? 0),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const results = [];
  for (const testCase of cases) results.push(await runCase(testCase, args));
  const passedCount = results.filter((result) => result.passed).length;
  const usage = results.reduce<TokenUsage>((total, result) => addUsage(addUsage(total, result.usage), result.judgeUsage), {});
  console.log(JSON.stringify({
    passed: passedCount === results.length,
    total: results.length,
    passedCount,
    failed: results.filter((result) => !result.passed).map((result) => ({ id: result.id, failures: result.failures, judge: result.judge })),
    results,
    usage,
  }, null, 2));
  if (passedCount !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
