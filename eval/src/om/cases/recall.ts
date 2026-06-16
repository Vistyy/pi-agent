import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord, EvalScoreDimension } from '../types.js';

const OM_OBSERVATIONS_RECORDED = 'om.observations.recorded';
const OM_REFLECTIONS_RECORDED = 'om.reflections.recorded';
const OM_REFLECTIONS_REWRITTEN = 'om.reflections.rewritten';
const recallModuleUrl = new URL('../../../../extensions/pi-observational-memory/src/session-ledger/recall.ts', import.meta.url).href;

async function loadRecallMemorySources(): Promise<(entries: unknown[], memoryId: string) => unknown> {
  const mod = await import(recallModuleUrl) as { recallMemorySources: (entries: unknown[], memoryId: string) => unknown };
  return mod.recallMemorySources;
}

const OBS_1 = 'obs_aaaaaaaaaaaa';
const OBS_2 = 'obs_bbbbbbbbbbbb';
const REF_1 = 'ref_cccccccccccc';
const REF_2 = 'ref_dddddddddddd';

type Entry = Record<string, unknown>;

type RecallCheck = { label: string; pass: (output: any) => boolean; detail?: (output: any) => unknown };

function sourceEntry(id: string, content = `source ${id}`): Entry {
  return { type: 'custom_message', id, timestamp: '2026-05-19T00:00:00.000Z', content };
}

function customEntry(id: string): Entry {
  return { type: 'custom', id, customType: 'not-source', data: {} };
}

function observation(id: string, sourceEntryIds: string[]): Record<string, unknown> {
  return { id, kind: 'observation', content: `Observation ${id}`, createdAt: '2026-05-19 00:00', timestamp: '2026-05-19 00:00', sourceEntryIds };
}

function reflection(id: string, sources: string[]): Record<string, unknown> {
  return { id, kind: 'reflection', content: `Reflection ${id}`, sources, createdAt: '2026-05-19T00:00:00.000Z' };
}

function observationsEntry(id: string, observations: Record<string, unknown>[]): Entry {
  return { type: 'custom', id, customType: OM_OBSERVATIONS_RECORDED, data: { observations, coversUpToId: 'src-1' } };
}

function reflectionsEntry(id: string, reflections: Record<string, unknown>[]): Entry {
  return { type: 'custom', id, customType: OM_REFLECTIONS_RECORDED, data: { reflections, coversUpToId: 'src-1' } };
}

function rewrittenEntry(id: string, retiredReflectionIds: string[]): Entry {
  return { type: 'custom', id, customType: OM_REFLECTIONS_REWRITTEN, data: { retiredReflectionIds, summary: 'merged' } };
}

function outputObservationIds(output: any): string[] {
  return (output?.observations ?? []).map((match: any) => match.observation?.id).filter(Boolean);
}

function outputReflectionIds(output: any): string[] {
  return (output?.reflections ?? []).map((match: any) => match.reflection?.id).filter(Boolean);
}

function outputSourceEntryIds(output: any): string[] {
  return (output?.sourceEntries ?? []).map((entry: any) => entry.id).filter(Boolean);
}

function statusIs(status: string): RecallCheck {
  return { label: `status is ${status}`, pass: (output) => output?.status === status, detail: (output) => output?.status };
}

function kindIs(kind: string): RecallCheck {
  return { label: `kind is ${kind}`, pass: (output) => output?.kind === kind, detail: (output) => output?.kind };
}

function includesObservationIds(...ids: string[]): RecallCheck {
  return { label: `includes observations ${ids.join(', ')}`, pass: (output) => ids.every((id) => outputObservationIds(output).includes(id)), detail: outputObservationIds };
}

function includesReflectionIds(...ids: string[]): RecallCheck {
  return { label: `includes reflections ${ids.join(', ')}`, pass: (output) => ids.every((id) => outputReflectionIds(output).includes(id)), detail: outputReflectionIds };
}

function includesSourceEntryIds(...ids: string[]): RecallCheck {
  return { label: `includes source entries ${ids.join(', ')}`, pass: (output) => ids.every((id) => outputSourceEntryIds(output).includes(id)), detail: outputSourceEntryIds };
}

function partialIs(value: boolean): RecallCheck {
  return { label: `partial is ${value}`, pass: (output) => output?.partial === value, detail: (output) => output?.partial };
}

function missingSourceIds(...ids: string[]): RecallCheck {
  return { label: `missing source ids ${ids.join(', ')}`, pass: (output) => ids.every((id) => (output?.missingSourceEntryIds ?? []).includes(id)), detail: (output) => output?.missingSourceEntryIds };
}

async function deterministicRecallEval(id: string, entries: Entry[], memoryId: string, hardChecks: RecallCheck[], scoreChecks: RecallCheck[] = []): Promise<AgentEvalRecord> {
  const started = Date.now();
  const recallMemorySources = await loadRecallMemorySources();
  const output = recallMemorySources(entries, memoryId);
  const failed = hardChecks.filter((check) => !check.pass(output));
  const dimensions: EvalScoreDimension[] = scoreChecks.map((check) => ({
    label: check.label,
    score: check.pass(output) ? 1 : 0,
    maxScore: 1,
    detail: check.detail?.(output) ?? output,
  }));
  const score = dimensions.reduce((total, dimension) => total + dimension.score, 0);
  const maxScore = dimensions.reduce((total, dimension) => total + dimension.maxScore, 0);
  const durationMs = Date.now() - started;
  return {
    id,
    agent: 'recall',
    output,
    passed: failed.length === 0,
    durationMs,
    agentDurationMs: durationMs,
    judge: failed.length === 0 ? { passed: true, reason: 'deterministic recall checks passed' } : { passed: false, reason: failed.map((check) => check.label).join('; '), details: failed.map((check) => ({ label: check.label, detail: check.detail?.(output) ?? output })) },
    score: { hardFailed: failed.length > 0, score, maxScore, dimensions },
  };
}

export async function recallActiveObservation(_model: string, _judgeModel: string, _thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  return deterministicRecallEval('recall-active-observation', [sourceEntry('src-1'), observationsEntry('obs-entry-1', [observation(OBS_1, ['src-1'])])], OBS_1, [statusIs('found'), kindIs('observation'), includesObservationIds(OBS_1), includesSourceEntryIds('src-1'), partialIs(false)]);
}

export async function recallReflectionChain(_model: string, _judgeModel: string, _thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const entries = [sourceEntry('src-1'), observationsEntry('obs-entry-1', [observation(OBS_1, ['src-1'])]), reflectionsEntry('ref-entry-1', [reflection(REF_1, [OBS_1])]), reflectionsEntry('ref-entry-2', [reflection(REF_2, [REF_1])])];
  return deterministicRecallEval('recall-reflection-chain', entries, REF_2, [statusIs('found'), kindIs('reflection'), includesReflectionIds(REF_2), includesObservationIds(OBS_1), includesSourceEntryIds('src-1'), partialIs(false)]);
}

export async function recallThroughRetiredReflection(_model: string, _judgeModel: string, _thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const entries = [sourceEntry('src-1'), observationsEntry('obs-entry-1', [observation(OBS_1, ['src-1'])]), reflectionsEntry('ref-entry-1', [reflection(REF_1, [OBS_1])]), rewrittenEntry('rewrite-entry-1', [REF_1]), reflectionsEntry('ref-entry-2', [reflection(REF_2, [REF_1])])];
  return deterministicRecallEval('recall-through-retired-reflection', entries, REF_2, [statusIs('found'), kindIs('reflection'), includesReflectionIds(REF_2), includesObservationIds(OBS_1), includesSourceEntryIds('src-1'), partialIs(false)]);
}

export async function recallRetiredReflectionDirectly(_model: string, _judgeModel: string, _thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const entries = [sourceEntry('src-1'), observationsEntry('obs-entry-1', [observation(OBS_1, ['src-1'])]), reflectionsEntry('ref-entry-1', [reflection(REF_1, [OBS_1])]), rewrittenEntry('rewrite-entry-1', [REF_1])];
  return deterministicRecallEval('recall-retired-reflection-directly', entries, REF_1, [statusIs('found'), kindIs('reflection'), includesReflectionIds(REF_1), includesObservationIds(OBS_1), includesSourceEntryIds('src-1'), partialIs(false)]);
}

export async function recallPartialMissingSource(_model: string, _judgeModel: string, _thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const entries = [customEntry('custom-1'), observationsEntry('obs-entry-1', [observation(OBS_1, ['missing-src', 'custom-1'])])];
  return deterministicRecallEval('recall-partial-missing-source', entries, OBS_1, [statusIs('found'), kindIs('observation'), includesObservationIds(OBS_1), partialIs(true), missingSourceIds('missing-src')]);
}

export async function recallNotFound(_model: string, _judgeModel: string, _thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const entries = [sourceEntry('src-1'), observationsEntry('obs-entry-1', [observation(OBS_1, ['src-1']), observation(OBS_2, ['src-1'])])];
  return deterministicRecallEval('recall-not-found', entries, 'obs_ffffffffffff', [statusIs('not_found')]);
}
