import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord, EvalScoreDimension, Observation, Reflection } from '../types.js';
import { addUsage, createUsageCollector, loadOmAgents, resolveModel } from '../runner.js';

const OM_OBSERVATIONS_RECORDED = 'om.observations.recorded';
const OM_REFLECTIONS_RECORDED = 'om.reflections.recorded';
const OM_REFLECTIONS_REWRITTEN = 'om.reflections.rewritten';
const recallModuleUrl = new URL('../../../../extensions/pi-observational-memory/src/session-ledger/recall.ts', import.meta.url).href;

type E2ECheck = { label: string; pass: (output: E2EOutput) => boolean; detail?: (output: E2EOutput) => unknown };
type Entry = Record<string, unknown>;

type E2EOutput = {
  observations: Observation[];
  reflections: Reflection[];
  rewrittenReflections: Reflection[];
  recall: unknown;
};

async function loadRecallMemorySources(): Promise<(entries: unknown[], memoryId: string) => unknown> {
  const mod = await import(recallModuleUrl) as { recallMemorySources: (entries: unknown[], memoryId: string) => unknown };
  return mod.recallMemorySources;
}

function text(output: E2EOutput): string {
  return [...output.observations, ...output.reflections, ...output.rewrittenReflections].map((item) => item.content).join('\n');
}

function requiresAll(...needles: string[]): E2ECheck {
  return { label: `requires ${needles.join(', ')}`, pass: (output) => needles.every((needle) => text(output).includes(needle)), detail: text };
}

function maxCounts(max: { observations: number; reflections: number; rewritten: number }): E2ECheck {
  return {
    label: `bounded output counts`,
    pass: (output) => output.observations.length <= max.observations && output.reflections.length <= max.reflections && output.rewrittenReflections.length <= max.rewritten,
    detail: (output) => ({ observations: output.observations.length, reflections: output.reflections.length, rewritten: output.rewrittenReflections.length, max }),
  };
}

function recallFound(): E2ECheck {
  return { label: 'recall finds rewritten reflection evidence', pass: (output) => (output.recall as any)?.status === 'found' && ((output.recall as any)?.observations ?? []).length > 0, detail: (output) => output.recall };
}

function sourceEntry(id: string, content: string): Entry {
  return { type: 'custom_message', id, timestamp: '2026-06-16T00:00:00.000Z', content };
}

function observationsEntry(observations: Observation[]): Entry {
  return { type: 'custom', id: 'obs-entry-1', customType: OM_OBSERVATIONS_RECORDED, data: { observations, coversUpToId: 's6' } };
}

function reflectionsEntry(id: string, reflections: Reflection[]): Entry {
  return { type: 'custom', id, customType: OM_REFLECTIONS_RECORDED, data: { reflections, coversUpToId: 's6' } };
}

function rewrittenEntry(retiredReflectionIds: string[]): Entry {
  return { type: 'custom', id: 'rewrite-entry-1', customType: OM_REFLECTIONS_REWRITTEN, data: { retiredReflectionIds, summary: 'compressed e2e memory' } };
}

function record(id: string, agentDurationMs: number, output: E2EOutput, hardChecks: E2ECheck[], scoreChecks: E2ECheck[], started: number, usage: any): AgentEvalRecord {
  const failed = hardChecks.filter((check) => !check.pass(output));
  const dimensions: EvalScoreDimension[] = scoreChecks.map((check) => ({ label: check.label, score: check.pass(output) ? 1 : 0, maxScore: 1, detail: check.detail?.(output) ?? output }));
  const score = dimensions.reduce((total, dimension) => total + dimension.score, 0);
  const maxScore = dimensions.reduce((total, dimension) => total + dimension.maxScore, 0);
  return {
    id,
    agent: 'e2e',
    output,
    passed: failed.length === 0,
    durationMs: Date.now() - started,
    agentDurationMs,
    usage,
    judge: failed.length === 0 ? { passed: true, reason: 'deterministic e2e checks passed' } : { passed: false, reason: failed.map((check) => check.label).join('; '), details: failed.map((check) => ({ label: check.label, detail: check.detail?.(output) ?? output })) },
    score: { hardFailed: failed.length > 0, score, maxScore, dimensions },
  };
}

export async function e2eObserverReflectorRewriteRecall(modelSpec: string, _judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const { runObserver, runReflector, runRewrite } = await loadOmAgents();
  const usage = createUsageCollector();
  const sourceEntries = [
    sourceEntry('s1', '[User] Current durable backend is SQLite at /tmp/jobs.db. Earlier Redis notes are stale.'),
    sourceEntry('s2', '[Tool evidence: bash] input: pnpm test tests/db.test.ts exitCode: 1 excerpt: Error: SQLITE_BUSY at src/db/migrate.ts:88'),
    sourceEntry('s3', '[User] Keep WAL enabled via PRAGMA journal_mode=WAL. Do not call SQLITE_BUSY fixed yet.'),
    sourceEntry('s4', '[Assistant] I will update docs.'),
    sourceEntry('s5', '[Tool evidence: bash] input: pnpm test tests/parser.test.ts exitCode: 0 excerpt: PASS parser keeps CRLF offsets'),
    sourceEntry('s6', '[User] Parser is validated now; database busy handling remains unresolved.'),
  ];
  const chunk = sourceEntries.map((entry) => `[Source entry id: ${entry.id}] ${entry.content}`).join('\n');
  const agentStarted = Date.now();
  const observations = await runObserver({ ...auth, chunk, allowedSourceEntryIds: sourceEntries.map((entry) => String(entry.id)), thinkingLevel, maxTurns: 4, onUsage: usage.onUsage }) ?? [];
  const reflections = await runReflector({ ...auth, observations, reflections: [], thinkingLevel, maxTurns: 4, onUsage: usage.onUsage }) ?? [];
  const rewrite = await runRewrite({ ...auth, reflections, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage });
  const rewrittenReflections = rewrite?.reflections ?? [];
  const entries = [...sourceEntries, observationsEntry(observations), reflectionsEntry('ref-entry-1', reflections), rewrittenEntry(reflections.map((reflection) => reflection.id)), reflectionsEntry('ref-entry-2', rewrittenReflections)];
  const recallMemorySources = await loadRecallMemorySources();
  const recallTarget = rewrittenReflections[0]?.id ?? reflections[0]?.id ?? observations[0]?.id ?? 'obs_missing';
  const output: E2EOutput = { observations, reflections, rewrittenReflections, recall: recallMemorySources(entries, recallTarget) };
  return record('e2e-observer-reflector-rewrite-recall', Date.now() - agentStarted, output, [requiresAll('SQLite', '/tmp/jobs.db'), requiresAll('SQLITE_BUSY', 'src/db/migrate.ts:88'), requiresAll('PRAGMA journal_mode=WAL'), requiresAll('unresolved'), recallFound()], [maxCounts({ observations: 6, reflections: 4, rewritten: 3 })], started, usage.total);
}
