import { runJudge } from '../lib/judge.js';
import type { Probe, TokenUsage } from '../lib/types.js';
import type { AgentEvalRecord, CuratorActionResult, CuratorCheck, CuratorEvalDiagnostics, Observation, Reflection } from './types.js';

export async function diagnoseFailure(record: AgentEvalRecord, probe: Probe, judgeModel: string): Promise<AgentEvalRecord> {
  if (record.passed) return record;
  const diagnosticProbe: Probe = {
    id: `${probe.id}-diagnostic`,
    question: 'Diagnose why the evaluated agent output failed this eval. Focus on prompt/input difficulty, missed evidence, confusing near-matches, and what change might improve behavior. Do not relitigate pass/fail.',
    rubric: {
      pass_if: ['Explains likely failure causes from the inputs, output, and expected behavior.'],
      fail_if: ['Only repeats the failure label without analysis.'],
    },
  };
  const diagnosticInput = JSON.stringify({ expected: probe, output: record.output, failure: record.judge, diagnostics: record.diagnostics }, null, 2);
  const diagnosticStarted = Date.now();
  const { run, judge } = await runJudge(diagnosticProbe, diagnosticInput, judgeModel);
  return { ...record, diagnosis: judge, diagnosisUsage: run.usage, diagnosisDurationMs: Date.now() - diagnosticStarted, durationMs: Date.now() - diagnosticStarted + record.durationMs };
}

export async function judged(id: string, agent: AgentEvalRecord['agent'], output: unknown, probe: Probe, judgeModel: string, started: number, usage?: TokenUsage, agentDurationMs?: number): Promise<AgentEvalRecord> {
  const answer = JSON.stringify(output, null, 2);
  const judgeStarted = Date.now();
  const { run, judge } = await runJudge(probe, answer, judgeModel);
  const record = { id, agent, output, judge, passed: run.status === 0 && judge.passed, durationMs: Date.now() - started, agentDurationMs, judgeDurationMs: Date.now() - judgeStarted, usage, judgeUsage: run.usage };
  return diagnoseFailure(record, probe, judgeModel);
}

export function curatorIds(output: CuratorActionResult | undefined, key: keyof CuratorActionResult): string[] {
  const value = output?.[key];
  if (!value) return [];
  if (key === 'dropped') return value as string[];
  return (value as Array<{ observationIds: string[] }>).flatMap((batch) => batch.observationIds);
}

export function curatorEvalDiagnostics(args: {
  observations: Observation[];
  reflections: Reflection[];
  pinnedObservationIds?: string[];
  flaggedObservationIds?: string[];
  protectedObservationIds?: string[];
  maxDropsAllowed?: number;
  phaseMetrics?: unknown[];
}): CuratorEvalDiagnostics {
  return args;
}

export function missingIds(output: CuratorActionResult | undefined, actionKeys: Array<keyof CuratorActionResult>, expectedIds: string[]): string[] {
  const actual = new Set(actionKeys.flatMap((key) => curatorIds(output, key)));
  return expectedIds.filter((id) => !actual.has(id));
}

export function forbiddenIds(output: CuratorActionResult | undefined, actionKeys: Array<keyof CuratorActionResult>, forbidden: string[]): string[] {
  const forbiddenSet = new Set(forbidden);
  return actionKeys.flatMap((key) => curatorIds(output, key).filter((id) => forbiddenSet.has(id)).map((id) => `${key}:${id}`));
}

export function unexpectedIds(output: CuratorActionResult | undefined, actionKey: keyof CuratorActionResult, allowed: string[]): string[] {
  const allowedSet = new Set(allowed);
  return curatorIds(output, actionKey).filter((id) => !allowedSet.has(id));
}

export function curatorActionIdSummary(output: CuratorActionResult | undefined): Record<string, string[]> {
  return {
    pinned: curatorIds(output, 'pinned'),
    unpinned: curatorIds(output, 'unpinned'),
    flagged: curatorIds(output, 'flagged'),
    dropped: curatorIds(output, 'dropped'),
  };
}

function deterministicCuratorFailure(output: CuratorActionResult | undefined, checks: CuratorCheck[]): { reason: string; details: unknown[] } | undefined {
  const failed = checks.filter((check) => !check.pass(output)).map((check) => ({ label: check.label, detail: check.detail?.(output) ?? curatorActionIdSummary(output) }));
  return failed.length ? { reason: failed.map((check) => check.label).join('; '), details: failed } : undefined;
}

function deterministicCuratorRecord(
  id: string,
  output: CuratorActionResult | undefined,
  started: number,
  checks: CuratorCheck[],
  usage?: TokenUsage,
  agentDurationMs?: number,
  diagnostics?: CuratorEvalDiagnostics,
): AgentEvalRecord {
  const deterministicFailure = deterministicCuratorFailure(output, checks);
  return {
    id,
    agent: 'curator',
    output: output ?? {},
    judge: deterministicFailure
      ? { passed: false, reason: `Deterministic invariant failed: ${deterministicFailure.reason}`, details: deterministicFailure.details }
      : { passed: true, reason: 'Deterministic invariants passed.' },
    passed: !deterministicFailure,
    durationMs: Date.now() - started,
    agentDurationMs,
    usage,
    diagnostics,
  };
}

export async function judgedCurator(
  id: string,
  output: CuratorActionResult | undefined,
  probe: Probe,
  judgeModel: string,
  started: number,
  checks: CuratorCheck[],
  usage?: TokenUsage,
  agentDurationMs?: number,
  diagnostics?: CuratorEvalDiagnostics,
): Promise<AgentEvalRecord> {
  const deterministic = deterministicCuratorRecord(id, output, started, checks, usage, agentDurationMs, diagnostics);
  if (!deterministic.passed) return diagnoseFailure(deterministic, probe, judgeModel);
  return deterministic;
}
