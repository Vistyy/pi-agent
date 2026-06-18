import { runJudge } from '../lib/judge.js';
import type { Probe, TokenUsage } from '../lib/types.js';
import type { AgentEvalRecord, EvalScoreDimension, Observation, OmGrader, Reflection } from './types.js';

const MIN_SCORED_PASS_RATIO = 0.5;

export function optional<TOutput>(grader: OmGrader<TOutput>): OmGrader<TOutput> {
  return { ...grader, required: false };
}

export async function gradeAgentOutput<TOutput>(args: {
  id: string;
  agent: 'observer' | 'reflector' | 'rewrite';
  output: TOutput | undefined;
  probe: Probe;
  judgeModel: string;
  started: number;
  graders: OmGrader<TOutput>[];
  usage?: TokenUsage;
  agentDurationMs?: number;
  diagnostics?: unknown;
  noToolCallLabel?: string;
}): Promise<AgentEvalRecord> {
  const graders: OmGrader<TOutput>[] = args.output === undefined && args.noToolCallLabel
    ? [{ label: args.noToolCallLabel, required: true, pass: () => false }, ...args.graders]
    : args.graders;
  const dimensions: EvalScoreDimension[] = graders.map((grader) => {
    const passed = grader.pass(args.output);
    const required = grader.required !== false;
    return { label: grader.label, required, passed, detail: grader.detail?.(args.output) ?? args.output };
  });
  const failedRequired = dimensions.filter((dimension) => dimension.required && !dimension.passed);
  const optionalDimensions = dimensions.filter((dimension) => !dimension.required);
  const score = optionalDimensions.filter((dimension) => dimension.passed).length;
  const maxScore = optionalDimensions.length;
  const diagnostics = args.diagnostics as { forceJudge?: boolean; skipJudge?: boolean } | undefined;
  const forceJudge = Boolean(diagnostics?.forceJudge);
  const skipJudge = Boolean(diagnostics?.skipJudge);
  const scoreFailure = failedRequired.length === 0 && maxScore > 0 && score / maxScore < MIN_SCORED_PASS_RATIO;
  const deterministicPass = !forceJudge && failedRequired.length === 0 && !scoreFailure && (skipJudge || (maxScore > 0 && score === maxScore));
  const judgeStarted = Date.now();
  const judged = failedRequired.length > 0 || scoreFailure || deterministicPass ? undefined : await runJudge(args.probe, JSON.stringify(args.output ?? [], null, 2), args.judgeModel);
  return {
    id: args.id,
    agent: args.agent,
    output: args.output ?? [],
    judge: failedRequired.length > 0
      ? { passed: false, reason: `Required graders failed: ${failedRequired.map((dimension) => dimension.label).join('; ')}`, details: failedRequired }
      : scoreFailure
        ? { passed: false, reason: `Optional grader score below threshold: ${score}/${maxScore}` }
        : deterministicPass
          ? { passed: true, reason: 'Deterministic graders passed.' }
          : judged?.judge,
    passed: deterministicPass || (failedRequired.length === 0 && !scoreFailure && judged?.run.status === 0 && judged.judge.passed),
    durationMs: Date.now() - args.started,
    agentDurationMs: args.agentDurationMs,
    judgeDurationMs: failedRequired.length > 0 || scoreFailure || deterministicPass ? undefined : Date.now() - judgeStarted,
    usage: args.usage,
    judgeUsage: judged?.run.usage,
    diagnostics: args.diagnostics,
    score: { hardFailed: failedRequired.length > 0, score, maxScore, dimensions },
  };
}

export function observerText(output: Observation[] | undefined): string {
  return (output ?? []).map((observation) => observation.content).join('\n');
}

export function observerSourceIds(output: Observation[] | undefined): string[] {
  return (output ?? []).flatMap((observation) => observation.sourceEntryIds);
}

export function observerRequiresAll(...needles: string[]): OmGrader<Observation[]> {
  return { label: `requires ${needles.join(', ')}`, pass: (output) => needles.every((needle) => observerText(output).includes(needle)), detail: (output) => observerText(output) };
}

export function observerForbidsAny(...needles: string[]): OmGrader<Observation[]> {
  return { label: `forbids ${needles.join(', ')}`, pass: (output) => needles.every((needle) => !observerText(output).includes(needle)), detail: (output) => observerText(output) };
}

export function observerMaxCount(max: number): OmGrader<Observation[]> {
  return { label: `at most ${max} observations`, pass: (output) => (output ?? []).length <= max, detail: (output) => ({ count: (output ?? []).length }) };
}

export function observerForbidsSourceIds(...ids: string[]): OmGrader<Observation[]> {
  return { label: `forbids source ids ${ids.join(', ')}`, pass: (output) => ids.every((id) => !observerSourceIds(output).includes(id)), detail: (output) => observerSourceIds(output) };
}

export function observerSourceIdsAllowed(allowedIds: string[]): OmGrader<Observation[]> {
  const allowed = new Set(allowedIds);
  return { label: `source ids limited to ${allowedIds.join(', ')}`, pass: (output) => observerSourceIds(output).every((id) => allowed.has(id)), detail: (output) => observerSourceIds(output) };
}

export function reflectionText(output: Reflection[] | undefined): string {
  return (output ?? []).map((reflection) => reflection.content).join('\n');
}

export function reflectionSourceIds(output: Reflection[] | undefined): string[] {
  return (output ?? []).flatMap((reflection) => reflection.sources);
}

export function reflectorRequiresAll(...needles: string[]): OmGrader<Reflection[]> {
  return { label: `requires ${needles.join(', ')}`, pass: (output) => needles.every((needle) => reflectionText(output).includes(needle)), detail: (output) => reflectionText(output) };
}

export function reflectorForbidsAny(...needles: string[]): OmGrader<Reflection[]> {
  return { label: `forbids ${needles.join(', ')}`, pass: (output) => needles.every((needle) => !reflectionText(output).includes(needle)), detail: (output) => reflectionText(output) };
}

export function reflectorMaxCount(max: number): OmGrader<Reflection[]> {
  return { label: `at most ${max} reflections`, pass: (output) => (output ?? []).length <= max, detail: (output) => ({ count: (output ?? []).length }) };
}

export function reflectorForbidsSourceIds(...ids: string[]): OmGrader<Reflection[]> {
  return { label: `forbids source ids ${ids.join(', ')}`, pass: (output) => ids.every((id) => !reflectionSourceIds(output).includes(id)), detail: (output) => reflectionSourceIds(output) };
}

export function reflectorSourceIdsAllowed(allowedIds: string[]): OmGrader<Reflection[]> {
  const allowed = new Set(allowedIds);
  return { label: `source ids limited to ${allowedIds.join(', ')}`, pass: (output) => reflectionSourceIds(output).every((id) => allowed.has(id)), detail: (output) => reflectionSourceIds(output) };
}
