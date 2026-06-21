#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import { argValue } from '../lib/args.js';
import { DEFAULT_MODEL, runPiSdk, type ToolCallRecord } from '../lib/pi.js';
import { recallUseCases, type RecallUseCase } from '../recall-use/cases.js';

function repoRoot(): string {
  return path.resolve(process.cwd(), '..');
}

type CaseResult = {
  id: string;
  passed: boolean;
  reason?: string;
  answer: string;
  recallCalls: ToolCallRecord[];
  durationMs: number;
};

function recallArgsId(call: ToolCallRecord): string | undefined {
  if (!call.args || typeof call.args !== 'object') return undefined;
  const id = (call.args as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

function judgeCase(testCase: RecallUseCase, answer: string, toolCalls: ToolCallRecord[] | undefined, durationMs: number): CaseResult {
  const recallCalls = (toolCalls ?? []).filter((call) => call.toolName === 'recall');
  const reasons: string[] = [];
  if (testCase.expectRecall && recallCalls.length === 0) reasons.push('expected a recall tool call');
  if (!testCase.expectRecall && recallCalls.length > 0) reasons.push('expected no recall tool call');
  if (testCase.expectedId && !recallCalls.some((call) => recallArgsId(call) === testCase.expectedId)) reasons.push(`expected recall id ${testCase.expectedId}`);
  for (const text of testCase.requiredAnswerText ?? []) {
    if (!answer.includes(text)) reasons.push(`answer missing required text: ${text}`);
  }
  for (const text of testCase.forbiddenAnswerText ?? []) {
    if (answer.includes(text)) reasons.push(`answer included forbidden text: ${text}`);
  }
  return {
    id: testCase.id,
    passed: reasons.length === 0,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    answer,
    recallCalls,
    durationMs,
  };
}

const outDir = argValue('--out') ?? `runs/recall-use-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const model = argValue('--model') ?? DEFAULT_MODEL;
const thinkingLevel = argValue('--thinking') as ModelThinkingLevel | undefined;
const only = argValue('--only');
const timeoutMs = Number(argValue('--case-timeout-ms') ?? '180000');
const extensionPath = argValue('--extension') ?? path.join(repoRoot(), 'extensions/pi-observational-memory');
const cwd = argValue('--cwd') ?? repoRoot();

const cases = recallUseCases().filter((testCase) => !only || testCase.id === only);
if (cases.length === 0) throw new Error(`No recall-use cases matched ${only ?? '(none)'}`);

fs.mkdirSync(outDir, { recursive: true });
const results: CaseResult[] = [];
for (const testCase of cases) {
  const run = await runPiSdk(testCase.prompt, {
    model,
    thinkingLevel,
    sessionFile: testCase.sessionFile,
    extensionPaths: [extensionPath],
    allowedTools: ['recall'],
    cwd,
    timeoutMs,
    maxAgentTurns: 4,
  });
  const result = run.status === 0
    ? judgeCase(testCase, run.stdout, run.toolCalls, run.durationMs)
    : { id: testCase.id, passed: false, reason: run.stderr || 'run failed', answer: run.stdout, recallCalls: [], durationMs: run.durationMs };
  results.push(result);
}

const passed = results.filter((result) => result.passed).length;
const summary = { passed, total: results.length, failed: results.filter((result) => !result.passed), results };
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(passed === results.length ? 0 : 1);
