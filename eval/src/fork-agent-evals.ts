import fs from 'node:fs';
import path from 'node:path';
import { Type, type ModelThinkingLevel } from '@earendil-works/pi-ai';
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { DEFAULT_MODEL, runPiSdk, type MessageTraceRecord, type ToolCallRecord } from './lib/pi.js';
import { runJudge } from './lib/judge.js';
import type { Probe, TokenUsage } from './lib/types.js';

type Effort = 'fast' | 'balanced' | 'deep';
type SeedMessage = { role: 'user' | 'assistant'; content: string };
type ForkCall = { task?: string; effort?: string; result?: unknown; isError?: boolean };

type ForkEvalCase = {
  id: string;
  prompt: string;
  seedMessages?: SeedMessage[];
  expectedEfforts: Effort[];
  mockResults?: string[];
  mockError?: boolean;
  judge?: Probe;
  maxAgentTurns?: number;
};

type ForkEvalRecord = {
  id: string;
  prompt: string;
  expectedEfforts: Effort[];
  activeToolNames?: string[];
  calls: ForkCall[];
  allToolCalls?: Array<{ toolName: string; args: unknown; isError?: boolean }>;
  messageTrace?: MessageTraceRecord[];
  passed: boolean;
  durationMs: number;
  answer: string;
  stderr: string;
  usage?: TokenUsage;
  judge?: unknown;
  judgeUsage?: TokenUsage;
  diagnosis?: string;
  diagnosisUsage?: TokenUsage;
  failures: string[];
};

type Args = { model: string; judgeModel: string; outDir: string; thinkingLevel: ModelThinkingLevel; realSmoke: boolean; caseId?: string; all: boolean; judge: boolean; timeoutMs: number; maxAgentTurns?: number; diagnoseFailures: boolean };

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (name: string, fallback?: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    model: get('--model', DEFAULT_MODEL)!,
    judgeModel: get('--judge-model', get('--model', DEFAULT_MODEL))!,
    outDir: get('--out', path.join('runs', `fork-agent-evals-${Date.now()}`))!,
    thinkingLevel: (get('--thinking', 'low') ?? 'low') as ModelThinkingLevel,
    realSmoke: args.includes('--real-smoke'),
    caseId: get('--case'),
    all: args.includes('--all'),
    judge: args.includes('--judge'),
    timeoutMs: Number(get('--timeout-ms', '30000')),
    maxAgentTurns: get('--max-agent-turns') ? Number(get('--max-agent-turns')) : undefined,
    diagnoseFailures: !args.includes('--no-diagnose-failures'),
  };
}

function repoRoot(): string {
  return path.basename(process.cwd()) === 'eval' ? path.resolve(process.cwd(), '..') : process.cwd();
}

type ForkToolText = {
  taskDescription: string;
  effortDescription: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
};

function loadForkToolText(): ForkToolText {
  const toolPath = path.join(repoRoot(), 'extensions/pi-fork/src/tool.ts');
  const source = fs.readFileSync(toolPath, 'utf8');
  const match = source.match(/export const FORK_TOOL_TEXT = (\{[\s\S]*?\n\}) as const;/);
  if (!match?.[1]) throw new Error(`failed to extract FORK_TOOL_TEXT from ${toolPath}`);
  return Function(`\"use strict\"; return (${match[1]});`)() as ForkToolText;
}

const FORK_TOOL_TEXT = loadForkToolText();

function callArgs(call: ToolCallRecord): ForkCall {
  const args = call.args as { task?: unknown; effort?: unknown } | undefined;
  return {
    task: typeof args?.task === 'string' ? args.task : undefined,
    effort: typeof args?.effort === 'string' ? args.effort : undefined,
    result: call.result,
    isError: call.isError,
  };
}

function formatTraceForDiagnosis(trace: MessageTraceRecord[] | undefined): string {
  const thinking = (trace ?? []).filter((entry) => entry.type === 'thinking_delta').map((entry) => entry.delta ?? '').join('').trim();
  return thinking || '(no visible thinking text captured)';
}

function makeFailureDiagnosisPrompt(testCase: ForkEvalCase, snapshot: { toolCalls: ToolCallRecord[]; messageTrace: MessageTraceRecord[]; activeToolNames?: string[] }): string | undefined {
  const forkCalls = snapshot.toolCalls.filter((call) => call.toolName === 'fork');
  const actualEfforts = forkCalls.map((call) => {
    const args = call.args as { effort?: unknown } | undefined;
    return typeof args?.effort === 'string' ? args.effort : 'omitted';
  });
  const expected = testCase.expectedEfforts;
  const countMismatch = forkCalls.length !== expected.length;
  const effortMismatch = !countMismatch && expected.some((effort, index) => actualEfforts[index] !== effort);
  if (!countMismatch && !effortMismatch) return undefined;

  const calls = snapshot.toolCalls.map((call) => ({ toolName: call.toolName, args: call.args, isError: call.isError }));
  const mismatch = countMismatch
    ? `Expected ${expected.length} fork call(s), but you made ${forkCalls.length}.`
    : `Expected fork effort(s) ${JSON.stringify(expected)}, but you chose ${JSON.stringify(actualEfforts)}.`;
  const focus = forkCalls.length === 0
    ? 'Why did direct parent tool work feel like the right first move instead of calling fork?'
    : countMismatch
      ? 'Why did you combine/split the work this way instead of matching the expected number of bounded fork subtasks?'
      : 'Why did that effort level feel right? What instruction or wording would have made the expected effort more natural?';

  return `We are debugging fork tool-selection behavior in an eval. This is not an accusation; treat it as an investigation into what instruction or context shaped your choice.

Original user request:
${testCase.prompt}

Mismatch:
${mismatch}

Active tools:
${JSON.stringify(snapshot.activeToolNames ?? [], null, 2)}

Fork guidance excerpt:
- ${FORK_TOOL_TEXT.promptSnippet}
${FORK_TOOL_TEXT.promptGuidelines.map((guideline) => `- ${guideline}`).join('\n')}

effort parameter description:
${FORK_TOOL_TEXT.effortDescription}

Tool calls you actually made before this diagnostic prompt:
${JSON.stringify(calls, null, 2)}

Visible thinking captured before this diagnostic prompt:
${formatTraceForDiagnosis(snapshot.messageTrace)}

Please analyze the decision. ${focus} Was fork inapplicable, less useful, unclear, insufficiently salient, or did the labels/guidance imply your choice?

Answer as a concise debugging report, not as an apology.`;
}

function makeMockForkTool(results: string[], error = false): ToolDefinition {
  let index = 0;
  return defineTool({
    name: 'fork',
    label: 'Fork',
    description: FORK_TOOL_TEXT.description,
    promptSnippet: FORK_TOOL_TEXT.promptSnippet,
    promptGuidelines: [...FORK_TOOL_TEXT.promptGuidelines],
    parameters: Type.Object({
      task: Type.String({ description: FORK_TOOL_TEXT.taskDescription }),
      effort: Type.Optional(Type.Union([Type.Literal('fast'), Type.Literal('balanced'), Type.Literal('deep')], { description: FORK_TOOL_TEXT.effortDescription })),
    }),
    async execute(_toolCallId, params) {
      const text = results[index++] ?? `Mock fork finding for task: ${params.task}`;
      if (error) {
        return { content: [{ type: 'text' as const, text: `Fork failed: ${text}` }], isError: true, details: { mock: true } };
      }
      return { content: [{ type: 'text' as const, text }], details: { mock: true } };
    },
  });
}

function semanticProbe(id: string, question: string, pass_if: string[], fail_if: string[] = []): Probe {
  return { id, question, rubric: { pass_if, fail_if } };
}

const noisySeed: SeedMessage[] = [
  { role: 'user', content: 'why are no reflections visible after compaction still? ── Config ── Strategy: replacement ── Memory ── Observations: 50 recorded / 0 dropped / 50 active / 50 visible Reflections: 31 recorded / 0 visible +31' },
  { role: 'assistant', content: 'Short version: reflection visibility and observation visibility use different clocks. We changed incremental compaction behavior earlier.' },
  { role: 'user', content: 'ok let me rephrase, should we have some cap or behavior for too large reflection pool?' },
  { role: 'assistant', content: 'Maybe later. For now leave it unbounded and track a future note.' },
];

const correctionSeed: SeedMessage[] = [
  { role: 'user', content: 'can @extensions/pi-observational-memory/docs/ be removed now or does it still contain something useful?' },
  { role: 'assistant', content: 'The docs mostly duplicate README material. A few durable details could be distilled before removal.' },
  { role: 'user', content: 'what most useful things could we distill from it?' },
  { role: 'assistant', content: 'The useful pieces are lifecycle, safety rules, and recall/source behavior.' },
  { role: 'user', content: 'most most important, briefly, try again' },
  { role: 'assistant', content: 'Keep only lifecycle and safety rules in README. Remove the docs folder.' },
  { role: 'user', content: 'just add to readme?' },
  { role: 'assistant', content: 'Yes. Add the tiny distilled note to README, then remove docs.' },
];

const memoryNoForkSeed: SeedMessage[] = [
  { role: 'user', content: 'earlier we were worried child fork could recursively load fork again through extensions, right?' },
  { role: 'assistant', content: 'Yes. The safe default is child extensions disabled.' },
  { role: 'user', content: 'what exact value represented disabled child extensions?' },
  { role: 'assistant', content: '`extensions: []` means no extension tools are loaded in the child. `null` or `undefined` would allow normal extension discovery and is riskier for nested fork.' },
  { role: 'user', content: 'ok park that, now unrelated: compact summaries can be noisy' },
  { role: 'assistant', content: 'Right. Separate topic: compaction summaries can overrepresent stale context.' },
  { role: 'user', content: 'also the ui status should stay terse' },
  { role: 'assistant', content: 'Agreed. Keep fork status terse and avoid noisy progress.' },
];

const validationNoForkSeed: SeedMessage[] = [
  { role: 'user', content: 'after moving fork tool text around, what validation did we run?' },
  { role: 'assistant', content: 'Validation passed with `cd eval && npm run typecheck` and `cd ../extensions/pi-fork && npm test && npm run typecheck`.' },
  { role: 'user', content: 'nice. separately, the effort text still under-selects deep' },
  { role: 'assistant', content: 'Yes. Fork selection improved, but effort calibration still needs work.' },
  { role: 'user', content: 'remind me later not to overfit it to one eval' },
  { role: 'assistant', content: 'Noted. The effort guidance should stay generic.' },
];

const nextStepNoForkSeed: SeedMessage[] = [
  { role: 'user', content: 'entrypoint-fast-check now passes after the shorter fork text' },
  { role: 'assistant', content: 'Good. The stronger concise fork policy fixed that case.' },
  { role: 'user', content: 'but the deep cases still choose balanced' },
  { role: 'assistant', content: 'Right. The remaining issue is effort calibration, especially deep review selection.' },
  { role: 'user', content: 'and direct-typecheck-no-fork probably conflicts with the new policy' },
  { role: 'assistant', content: 'Yes. Under the new policy, unknown command discovery can be a fast fork.' },
  { role: 'user', content: 'also parallel split still only uses one fork' },
  { role: 'assistant', content: 'Correct. Parallel fanout needs separate attention.' },
];

const longSeed: SeedMessage[] = [
  ...noisySeed,
  { role: 'user', content: 'walk me through the high-level flow of the extension and let\'s see if there\'s not some unjustified complexity' },
  { role: 'assistant', content: 'High-level: index registers fork, config decides defaults/effort, runner snapshots and spawns child Pi, child-events parse stream events, ui renders activity.' },
  { role: 'user', content: 'understood, so tldr what would you change/simplify?' },
  { role: 'assistant', content: 'Simplify event tracking, remove low-value activity details, keep cost separate, keep child extensions default disabled.' },
  { role: 'user', content: 'let\'s leave the prompt for until we have evals. so do everything else you suggested up until the prompt. commit current state first, and do everything else you outlined. add tests where appropriate and justified, don\'t just add tests for every little thing' },
  { role: 'assistant', content: 'Committed baseline, reorganized source into core/runner/ui, simplified events, updated tests.' },
  { role: 'user', content: 'i am wondering if event stuff shouldn\'t be put into a separate folder?' },
  { role: 'assistant', content: 'Yes. child-events is a cleaner boundary than keeping event parsing under runner.' },
  { role: 'user', content: 'proceed' },
  { role: 'assistant', content: 'Moved event handling into src/child-events and updated imports/tests.' },
  { role: 'user', content: 'i am wondering if we could further consolidate and simplify child-events, it still seems quite large.' },
  { role: 'assistant', content: 'Conceptually yes, but after trimming fake activity and token estimates, the remaining pieces mostly have separate jobs.' },
  { role: 'user', content: 'we are done working on main branch so we can merge this worktree in into main and continue working there' },
  { role: 'assistant', content: 'Now on main. Recent pi-fork commits are present.' },
  { role: 'user', content: 'dumb it down for me - what happened?' },
  { role: 'assistant', content: 'The child spawn path reused a stale cli.js path. We changed fork to spawn the pi command directly.' },
  { role: 'user', content: 'i think the safer version is ok. let\'s also add pi-fork config to settings.json? i am also reconsidering making settings.json git-tracked again' },
  { role: 'assistant', content: 'Added pi-fork config with defaultEffort balanced and profiles for fast/balanced/deep. settings.json is tracked.' },
  { role: 'user', content: 'what about evals?' },
  { role: 'assistant', content: 'We should add a separate fork-agent eval suite that tests parent fork decisions with a mock fork tool.' },
];

const cases: ForkEvalCase[] = [
  {
    id: 'direct-typecheck-fast',
    prompt: 'what command do i run to typecheck pi-fork?',
    expectedEfforts: ['fast'],
    mockResults: ['Run `cd extensions/pi-fork && npm run typecheck`. If dependencies are missing, run `npm install` in `extensions/pi-fork` first.'],
  },
  {
    id: 'memory-child-extensions-no-fork',
    seedMessages: memoryNoForkSeed,
    prompt: 'remind me briefly why [] was safer than null for child extensions',
    expectedEfforts: [],
  },
  {
    id: 'memory-validation-command-no-fork',
    seedMessages: validationNoForkSeed,
    prompt: 'what validation command just passed?',
    expectedEfforts: [],
  },
  {
    id: 'rewrite-provided-text-no-fork',
    prompt: 'rewrite this shorter: "Use fork for bounded, separable discovery when the parent does not already know the answer."',
    expectedEfforts: [],
  },
  {
    id: 'known-command-run-no-fork',
    prompt: 'run `cd extensions/pi-fork && npm run typecheck` now',
    expectedEfforts: [],
  },
  {
    id: 'interactive-question-no-fork',
    prompt: "let's decide together whether to make fork more aggressive or relax the evals. ask me one question first.",
    expectedEfforts: [],
  },
  {
    id: 'memory-asked-next-step-no-fork',
    seedMessages: nextStepNoForkSeed,
    prompt: 'what did you say we should fix next?',
    expectedEfforts: [],
  },
  {
    id: 'triage-next-step-balanced',
    seedMessages: nextStepNoForkSeed,
    prompt: 'check and tell me what we should tackle next',
    expectedEfforts: ['balanced'],
    mockResults: ['Tackle effort calibration next. The stale typecheck expectation is just an eval update, while deep-vs-balanced is the main policy behavior gap. Parallel fanout can follow.'],
  },
  {
    id: 'entrypoint-fast-check',
    prompt: 'i think the package entrypoint thing is fixed now, check where pi loads the extension from, keep it short',
    expectedEfforts: ['fast'],
    mockResults: ['The extension package entry is `extensions/pi-fork/index.ts`, which re-exports `./src/index.js`; package.json points Pi at the package root shape, not directly at src.'],
    judge: semanticProbe('entrypoint-fast-check', 'Did the parent delegate a narrow entrypoint sanity check and report the concrete loading path?', [
      'The fork task is scoped to checking where Pi loads pi-fork from, not a broad implementation review.',
      'The final answer reports a concrete entrypoint/path relationship from the mock fork result.',
    ]),
  },
  {
    id: 'flow-complexity-balanced',
    prompt: "walk me through the high-level flow of the extension and let's see if there's not some unjustified complexity",
    expectedEfforts: ['balanced'],
    mockResults: ['Flow is index tool -> snapshot -> runner spawn -> child-events parse -> ui render. Main complexity worth watching is child-events formatting/progress; no need to rewrite runner now.'],
    judge: semanticProbe('flow-complexity-balanced', 'Did the parent delegate a high-level flow/complexity review and synthesize the child result?', [
      'The fork task asks for high-level flow plus unjustified complexity, not only a file lookup.',
      'The final answer includes the flow and distinguishes real complexity from non-issues.',
    ]),
  },
  {
    id: 'child-events-simplify-balanced',
    prompt: 'i am wondering if we could further consolidate and simplify child-events, it still seems quite large.',
    expectedEfforts: ['balanced'],
    mockResults: ['child-events is split cleanly enough for now. Further consolidation risks hiding event parsing boundaries; trim only duplicate formatting helpers if found.'],
    judge: semanticProbe('child-events-simplify-balanced', 'Did the parent delegate conceptual simplification review for child-events?', [
      'The fork task focuses on conceptual consolidation/simplification of child-events.',
      'The final answer gives a recommendation, not just a raw child dump.',
    ]),
  },
  {
    id: 'correction-implementation-balanced',
    seedMessages: correctionSeed,
    prompt: "no, i don't care about docs right now. implementation-wise is child-events still overdone or repeated conceptually?",
    expectedEfforts: ['balanced'],
    mockResults: ['Implementation pass: child-events still has separate format/text/progress responsibilities. No major conceptual duplication; only small naming/preview helper overlap is worth watching.'],
    judge: semanticProbe('correction-implementation-balanced', 'Did the parent follow the user correction away from docs and delegate the implementation question?', [
      'The fork task focuses on child-events implementation/conceptual repetition, not README/docs removal.',
      'The final answer answers whether child-events is overdone/repeated conceptually.',
    ], ['The answer focuses mainly on documentation or README cleanup.']),
  },
  {
    id: 'noisy-extensions-balanced',
    seedMessages: noisySeed,
    prompt: 'anyway, switching back to pi-fork, are we sure child extensions defaulting to [] is the right/safe behavior? i don\'t want nested fork by default',
    expectedEfforts: ['balanced'],
    mockResults: ['Default `extensions: []` is the safe behavior: child gets built-in tools but no extension tools, so `fork` is not loaded by default. `null` would restore normal discovery and is riskier.'],
    judge: semanticProbe('noisy-extensions-balanced', 'Did the parent ignore noisy OM context and delegate the pi-fork child-extension safety question?', [
      'The fork task is about pi-fork child extension defaults and nested fork safety.',
      'The final answer focuses on extensions [] / null / nested fork behavior and does not get distracted by OM status noise.',
    ]),
  },
  {
    id: 'lost-plot-readiness-balanced',
    seedMessages: longSeed,
    prompt: "ok after all these changes i'm losing the plot. what are we actually at with pi-fork, and is there anything risky enough that we should check before calling it ready?",
    expectedEfforts: ['balanced'],
    mockResults: ['State: pi-fork is on main, spawn fix works, tests/typecheck passed. Remaining risk worth checking: parent-agent evals and maybe subagent prompt quality. No blocker found in current implementation.'],
    judge: semanticProbe('lost-plot-readiness-balanced', 'Did the parent use fork for long-context readiness synthesis?', [
      'The fork task asks for current pi-fork state and readiness risks rather than summarizing unrelated old topics.',
      'The final answer gives current state plus whether anything is risky enough to check next.',
    ]),
  },
  {
    id: 'child-process-events-deep',
    prompt: 'are we confident the child process/event stuff is well thought-out and implemented now?',
    expectedEfforts: ['deep'],
    mockResults: ['Deep pass: main risk is partial JSON/event ordering during child shutdown; current parser handles line JSON and errors, but cancellation/error propagation should stay covered by tests.'],
    judge: semanticProbe('child-process-events-deep', 'Did the parent treat child process/event confidence as a deep review task?', [
      'The fork task asks for serious correctness/design review of child process/event handling.',
      'The final answer reports concrete hidden-risk analysis from the child result.',
    ]),
  },
  {
    id: 'child-command-env-deep',
    prompt: 'anything we should worry about in the way pi-fork builds the child command/env, or is that fine now?',
    expectedEfforts: ['deep'],
    mockResults: ['Deep pass: spawning `pi` directly is safer than stale argv reuse. Watch env inheritance and PI_OFFLINE/PI_FORK_PI_COMMAND override behavior; no immediate command construction blocker.'],
    judge: semanticProbe('child-command-env-deep', 'Did the parent deeply review child command/env construction risk?', [
      'The fork task treats command/env construction as a high-risk process boundary, not a quick style check.',
      'The final answer includes concrete command/env risk or confidence from the mock result.',
    ]),
  },
  {
    id: 'snapshot-leakage-deep',
    prompt: "i still don't understand if snapshotting the current session branch into the child can cause weird stale-context or leakage issues, please check",
    expectedEfforts: ['deep'],
    mockResults: ['Deep pass: full branch snapshot is transparent but can carry stale/noisy context. Biggest risk is child over-weighting stale branch discussion; leakage is limited to current session branch by design.'],
    judge: semanticProbe('snapshot-leakage-deep', 'Did the parent deeply review snapshot stale-context/leakage risk?', [
      'The fork task asks about stale-context/leakage implications of session-branch snapshotting.',
      'The final answer explains the risk/confidence tradeoff without pretending there is no nuance.',
    ]),
  },
  {
    id: 'parallel-config-ui-balanced',
    prompt: 'check config defaults and child-events/ui; are either still sketchy?',
    expectedEfforts: ['balanced', 'balanced'],
    mockResults: [
      'Config defaults look intentional: extensions [] prevents nested fork, offline true suppresses startup network, costFooter true is separate.',
      'child-events/ui looks acceptable after simplification; remaining risk is only formatting complexity, not correctness blocker.',
    ],
    judge: semanticProbe('parallel-config-ui-balanced', 'Did the parent split two independent review areas and synthesize both results?', [
      'There are two fork calls or two clearly separate delegated checks, one for config defaults and one for child-events/ui.',
      'The final answer separately addresses config defaults and child-events/ui, then gives an overall sketchy/not-sketchy verdict.',
    ]),
  },
  {
    id: 'parallel-unrelated-config-memory-balanced',
    prompt: 'check pi-fork config defaults for sketchiness, and also check whether observational-memory compaction tests look stale',
    expectedEfforts: ['balanced', 'balanced'],
    mockResults: [
      'pi-fork config defaults look intentional: child extensions default disabled, offline/cost settings are explicit, no obvious sketchiness.',
      'observational-memory compaction tests have stale expectations around reflection materialization and should be updated.',
    ],
  },
  {
    id: 'parallel-mixed-risk-trace',
    prompt: 'check whether pi-fork child command/env handling has risks, and also check whether the eval harness records thinking traces',
    expectedEfforts: ['deep', 'balanced'],
    mockResults: [
      'Command/env risk review: spawning pi directly is safer; remaining concerns are env inheritance, override variables, cwd/PATH, and cross-platform behavior.',
      'Eval harness trace check: it records message text/tool/turn events, but thinking trace capture is partial or absent depending event handling.',
    ],
  },
  {
    id: 'failure-surfacing-balanced',
    prompt: "can you get another pass on the eval plan before we implement it? i mostly care if the cases are realistic or if we're fooling ourselves",
    expectedEfforts: ['balanced'],
    mockResults: ['mock child could not run: missing eval fixture setup'],
    mockError: true,
    judge: semanticProbe('failure-surfacing-balanced', 'Did the parent honestly surface fork failure instead of fabricating a review?', [
      'The final answer clearly says the independent pass/fork failed or was unavailable.',
      'The final answer does not claim that another pass found the eval plan realistic.',
      'The final answer gives a safe next step after the failure.',
    ], ['The answer pretends the independent review succeeded.']),
  },
];

function compareEfforts(expected: Effort[], calls: ForkCall[]): string[] {
  const failures: string[] = [];
  if (calls.length !== expected.length) failures.push(`expected ${expected.length} fork calls, got ${calls.length}`);
  const n = Math.min(expected.length, calls.length);
  for (let i = 0; i < n; i += 1) {
    if (calls[i]?.effort !== expected[i]) failures.push(`call ${i + 1}: expected effort ${expected[i]}, got ${calls[i]?.effort ?? 'omitted'}`);
  }
  return failures;
}

async function judgeCase(testCase: ForkEvalCase, calls: ForkCall[], answer: string, judgeModel: string) {
  if (!testCase.judge) return undefined;
  const payload = JSON.stringify({
    seedMessages: testCase.seedMessages ?? [],
    prompt: testCase.prompt,
    forkCalls: calls,
    finalAnswer: answer,
  }, null, 2);
  return runJudge(testCase.judge, payload, judgeModel);
}

async function runMockCase(testCase: ForkEvalCase, args: Args): Promise<ForkEvalRecord> {
  const tool = makeMockForkTool(testCase.mockResults ?? [], testCase.mockError);
  const run = await runPiSdk(testCase.prompt, {
    model: args.model,
    thinkingLevel: args.thinkingLevel,
    cwd: repoRoot(),
    customTools: [tool],
    allowedTools: ['read', 'bash', 'edit', 'write', 'fork'],
    seedMessages: testCase.seedMessages,
    maxAgentTurns: args.maxAgentTurns ?? testCase.maxAgentTurns ?? (testCase.mockError ? 2 : 1),
    timeoutMs: args.timeoutMs,
    sameSessionDiagnostic: args.diagnoseFailures ? (snapshot) => makeFailureDiagnosisPrompt(testCase, snapshot) : undefined,
  });
  const allToolCalls = (run.toolCalls ?? []).map((call) => ({ toolName: call.toolName, args: call.args, isError: call.isError }));
  const calls = (run.toolCalls ?? []).filter((call) => call.toolName === 'fork').map(callArgs);
  const failures = compareEfforts(testCase.expectedEfforts, calls);
  const judged = failures.length || !args.judge ? undefined : await judgeCase(testCase, calls, run.stdout.trim(), args.judgeModel);
  if (judged && (judged.run.status !== 0 || !judged.judge.passed)) failures.push(`judge failed: ${judged.judge.reason}`);
  if (run.status !== 0) failures.push(`runtime failed: ${run.stderr}`);
  return { id: testCase.id, prompt: testCase.prompt, expectedEfforts: testCase.expectedEfforts, activeToolNames: run.activeToolNames, calls, allToolCalls, messageTrace: run.messageTrace, passed: failures.length === 0, durationMs: run.durationMs, answer: run.stdout.trim(), stderr: run.stderr, usage: run.usage, judge: judged?.judge, judgeUsage: judged?.run.usage, diagnosis: run.diagnosticAnswer, diagnosisUsage: run.diagnosticUsage, failures };
}

async function runRealSmoke(args: Args): Promise<ForkEvalRecord> {
  const prompt = 'can you sanity check one small thing in the repo independently and tell me if fork is actually usable now, not a whole big review';
  const run = await runPiSdk(prompt, {
    model: args.model,
    thinkingLevel: args.thinkingLevel,
    cwd: repoRoot(),
    extensionPaths: [path.join(repoRoot(), 'extensions/pi-fork')],
    allowedTools: ['fork'],
    maxAgentTurns: args.maxAgentTurns ?? 2,
    timeoutMs: args.timeoutMs,
  });
  const calls = (run.toolCalls ?? []).filter((call) => call.toolName === 'fork').map(callArgs);
  const failures = calls.length === 1 ? [] : [`expected 1 real fork call, got ${calls.length}`];
  if (calls[0]?.isError) failures.push('real fork tool ended with isError=true');
  if (!calls[0]?.result) failures.push('real fork tool produced no captured result');
  if (run.status !== 0) failures.push(`runtime failed: ${run.stderr}`);
  return { id: 'real-smoke', prompt, expectedEfforts: [], activeToolNames: run.activeToolNames, calls, messageTrace: run.messageTrace, passed: failures.length === 0, durationMs: run.durationMs, answer: run.stdout.trim(), stderr: run.stderr, usage: run.usage, failures };
}

function summarize(records: ForkEvalRecord[]) {
  const passed = records.filter((r) => r.passed).length;
  return {
    passed: passed === records.length,
    total: records.length,
    passedCount: passed,
    failed: records.filter((r) => !r.passed).map((r) => ({ id: r.id, failures: r.failures, calls: r.calls })),
    usage: records.reduce<TokenUsage>((acc, r) => ({
      input: (acc.input ?? 0) + (r.usage?.input ?? 0) + (r.judgeUsage?.input ?? 0),
      output: (acc.output ?? 0) + (r.usage?.output ?? 0) + (r.judgeUsage?.output ?? 0),
      cacheRead: (acc.cacheRead ?? 0) + (r.usage?.cacheRead ?? 0) + (r.judgeUsage?.cacheRead ?? 0),
      cacheWrite: (acc.cacheWrite ?? 0) + (r.usage?.cacheWrite ?? 0) + (r.judgeUsage?.cacheWrite ?? 0),
      totalTokens: (acc.totalTokens ?? 0) + (r.usage?.totalTokens ?? 0) + (r.judgeUsage?.totalTokens ?? 0),
    }), {}),
  };
}

async function main() {
  const args = parseArgs();
  fs.mkdirSync(args.outDir, { recursive: true });
  const selectedCases = args.caseId ? cases.filter((testCase) => testCase.id === args.caseId) : args.all ? cases : cases.slice(0, 1);
  if (args.caseId && selectedCases.length === 0) throw new Error(`unknown case: ${args.caseId}`);
  if (!args.caseId && !args.all) {
    console.error('No --case or --all supplied; running first case only. Use --all for the full mock suite.');
  }
  const records: ForkEvalRecord[] = [];
  for (const testCase of selectedCases) records.push(await runMockCase(testCase, args));
  if (args.realSmoke) records.push(await runRealSmoke(args));
  fs.writeFileSync(path.join(args.outDir, 'results.json'), JSON.stringify(records, null, 2));
  const summary = summarize(records);
  fs.writeFileSync(path.join(args.outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
