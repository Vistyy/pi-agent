import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mapLimit } from './concurrency.js';
import { fixtureDirs, fixtureId, readCalibration, readEvalFile, readProbes, sourceSessionPath } from './fixtures.js';
import { MINIMAL_JUDGE_SYSTEM_PROMPT, judgePrompt, runJudge } from './judge.js';
import { DEFAULT_MODEL, runPiSdk } from './pi.js';
import { writeSummary } from './summary.js';
import type { AgentResult, FailureClassification, JudgedResult, PiInvocation, Probe } from './types.js';

type EvalTask = { fixture: string; probe: Probe; invocation: PiInvocation };

function classifyResult(answer: AgentResult, judgeExitCode: number, judgePassed: boolean): FailureClassification {
  if (answer.exitCode !== 0 || judgeExitCode !== 0) return 'judge_or_runtime_error';
  if (judgePassed) return 'pass';
  const text = answer.answer.trim();
  const compactionText = answer.compaction ? JSON.stringify(answer.compaction) : '';
  if (text === 'INSUFFICIENT_CONTEXT') return compactionText.length > 80 ? 'answer_use_failure' : 'memory_missing';
  if (/stale|old|prior|wrong|rejected|not current|superseded/i.test(text)) return 'wrong_stale_memory';
  return 'rubric_or_answer_omission';
}

export type EvalOptions = {
  fixturesRoot: string;
  outDir: string;
  model?: string;
  judgeModel?: string;
  concurrency?: number;
  dryRun?: boolean;
  calibrate?: boolean;
  extensionPaths?: string[];
  compactBeforePrompt?: boolean;
  compactInstructions?: string;
  allowedTools?: string[];
  cwd?: string;
  prepareMemoryBeforeCompact?: boolean;
  memoryPrepareWaitMs?: number;
  memoryPrepareTurns?: number;
};

function buildTasks(options: Pick<EvalOptions, 'fixturesRoot' | 'model' | 'extensionPaths' | 'compactBeforePrompt' | 'compactInstructions' | 'allowedTools' | 'prepareMemoryBeforeCompact' | 'memoryPrepareWaitMs' | 'memoryPrepareTurns'>): EvalTask[] {
  const tasks: EvalTask[] = [];
  const model = options.model ?? DEFAULT_MODEL;
  for (const dir of fixtureDirs(options.fixturesRoot)) {
    const fixture = fixtureId(dir);
    const evalFile = readEvalFile(dir);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), `pi-eval-${fixture}-`));
    const sessionCopy = path.join(temp, 'session.jsonl');
    fs.copyFileSync(sourceSessionPath(dir), sessionCopy);
    for (const probe of readProbes(dir)) {
      const prompt = `Answer using existing session context only. Be very concise: 1-3 short sentences, or bullets only if needed. Include only details required by the probe. If context is insufficient, say exactly: INSUFFICIENT_CONTEXT.\n\nProbe: ${probe.question}`;
      tasks.push({ fixture, probe, invocation: { kind: 'sdk', model, sessionFile: sessionCopy, prompt, extensionPaths: options.extensionPaths, compactBeforePrompt: options.compactBeforePrompt ?? evalFile.compact_before_probe, compactInstructions: options.compactInstructions ?? evalFile.compact_instructions, compactionSettings: evalFile.compaction_settings, allowedTools: options.allowedTools, prepareMemoryBeforeCompact: options.prepareMemoryBeforeCompact, memoryPrepareWaitMs: options.memoryPrepareWaitMs, memoryPrepareTurns: options.memoryPrepareTurns } });
    }
  }
  return tasks;
}

export async function calibrateJudge(options: Pick<EvalOptions, 'fixturesRoot' | 'outDir' | 'judgeModel'>) {
  const started = Date.now();
  const model = options.judgeModel ?? DEFAULT_MODEL;
  fs.mkdirSync(options.outDir, { recursive: true });
  const records = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
  for (const dir of fixtureDirs(options.fixturesRoot, true)) {
    const probes = readProbes(dir);
    if (probes.length !== 1) throw new Error(`calibration currently expects one probe per fixture: ${fixtureId(dir)}`);
    const probe = probes[0]!;
    const examples = readCalibration(dir);
    const prompt = `${judgePrompt(probe, 'EXAMPLE_ANSWER')}

Instead of grading EXAMPLE_ANSWER, grade each answer in this JSON array independently:
${JSON.stringify(examples.map((e) => ({ id: e.id, answer: e.answer })), null, 2)}

Return only a JSON array. Each item must be:
{"id": string, "passed": boolean, "reason": string, "missing": string[], "incorrect": string[]}`;
    const run = await runPiSdk(prompt, { model, systemPrompt: MINIMAL_JUDGE_SYSTEM_PROMPT });
    usage.input += run.usage?.input ?? 0;
    usage.output += run.usage?.output ?? 0;
    usage.cacheRead += run.usage?.cacheRead ?? 0;
    usage.cacheWrite += run.usage?.cacheWrite ?? 0;
    usage.totalTokens += run.usage?.totalTokens ?? 0;
    let judged: Array<{ id: string; passed: boolean; reason: string; missing: string[]; incorrect: string[] }> = [];
    try {
      const match = run.stdout.match(/\[[\s\S]*\]/);
      if (!match) throw new Error(`judge returned no JSON array: ${run.stdout}`);
      judged = JSON.parse(match[0]);
    } catch (error) {
      judged = examples.map((e) => ({ id: e.id, passed: false, reason: String(error), missing: [], incorrect: ['judge_parse_error'] }));
    }
    for (const example of examples) {
      const judge = judged.find((j) => j.id === example.id) ?? { id: example.id, passed: false, reason: 'missing calibration result', missing: [], incorrect: ['missing_calibration_result'] };
      records.push({
        fixture: fixtureId(dir),
        probe: probe.id,
        example: example.id,
        expected_passed: example.expected_passed,
        judge: { passed: judge.passed, reason: judge.reason, missing: judge.missing, incorrect: judge.incorrect },
        passed: run.status === 0 && judge.passed === example.expected_passed,
        judgeExitCode: run.status,
        judgeStderr: run.stderr,
        judgeUsage: run.usage,
      });
    }
  }
  const out = path.join(options.outDir, 'calibration.json');
  fs.writeFileSync(out, JSON.stringify(records, null, 2));
  return { out, passed: records.every((r) => r.passed), records, durationMs: Date.now() - started, usage };
}

export async function runEval(options: EvalOptions) {
  const started = Date.now();
  const model = options.model ?? DEFAULT_MODEL;
  const judgeModel = options.judgeModel ?? model;
  const concurrency = options.concurrency ?? 1;
  fs.mkdirSync(options.outDir, { recursive: true });

  let calibrationSummary: unknown;
  if (options.calibrate) {
    const calibration = await calibrateJudge({ fixturesRoot: options.fixturesRoot, outDir: options.outDir, judgeModel });
    calibrationSummary = { passed: calibration.passed, total: calibration.records.length, durationMs: calibration.durationMs, usage: calibration.usage, failed: calibration.records.filter((r) => !r.passed).map((r) => ({ fixture: r.fixture, example: r.example, expected_passed: r.expected_passed, judge: r.judge })) };
    if (!calibration.passed) return { passed: false, calibration, summary: undefined };
  }

  const tasks = buildTasks(options);
  if (options.dryRun) {
    const out = path.join(options.outDir, 'planned.json');
    fs.writeFileSync(out, JSON.stringify(tasks.map(({ fixture, probe, invocation }) => ({ fixture, probe: probe.id, invocation })), null, 2));
    return { passed: true, planned: out, summary: undefined };
  }

  const judged = await mapLimit(tasks, concurrency, async ({ fixture, probe, invocation }): Promise<JudgedResult> => {
    const run = await runPiSdk(invocation.prompt, { model, sessionFile: invocation.sessionFile, cwd: options.cwd, extensionPaths: invocation.extensionPaths, compactBeforePrompt: invocation.compactBeforePrompt, compactInstructions: invocation.compactInstructions, compactionSettings: invocation.compactionSettings, allowedTools: invocation.allowedTools, prepareMemoryBeforeCompact: invocation.prepareMemoryBeforeCompact, memoryPrepareWaitMs: invocation.memoryPrepareWaitMs, memoryPrepareTurns: invocation.memoryPrepareTurns });
    const answer: AgentResult = { fixture, probe: probe.id, invocation, compaction: run.compaction, executed: true, exitCode: run.status, durationMs: run.durationMs, answer: run.stdout.trim(), stderr: run.stderr, usage: run.usage, prepUsage: run.prepUsage, answerUsage: run.answerUsage, compactionUsage: run.compactionUsage };
    const { run: judgeRun, judge } = await runJudge(probe, answer.answer, judgeModel);
    return { ...answer, judge, classification: classifyResult(answer, judgeRun.status, judge.passed), judgeExitCode: judgeRun.status, judgeStderr: judgeRun.stderr, judgeDurationMs: judgeRun.durationMs, judgeUsage: judgeRun.usage };
  });

  fs.writeFileSync(path.join(options.outDir, 'results.json'), JSON.stringify(judged.map(({ judge, judgeExitCode, judgeStderr, judgeUsage, ...answer }) => answer), null, 2));
  fs.writeFileSync(path.join(options.outDir, 'judged-results.json'), JSON.stringify(judged, null, 2));
  const summary = writeSummary(judged, options.outDir, { wallClockMs: Date.now() - started, calibration: calibrationSummary });
  return { passed: judged.every((r) => r.exitCode === 0 && r.judgeExitCode === 0 && r.judge.passed), summary };
}
