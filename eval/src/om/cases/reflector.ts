import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord, Observation, Reflection } from '../types.js';
import { runReflectorEval } from '../agent-runner.js';
import { obs, ref } from '../runner.js';
import { gradeAgentOutput, optional, reflectorForbidsAny, reflectorMaxCount, reflectorRequiresAll, reflectorSourceIdsAllowed } from '../diagnostics.js';
import { realReflector16 as realReflector16v2 } from './real-session-fixtures-v2.js';

async function gradeReflector(args: {
  id: string;
  model: string;
  judgeModel: string;
  thinkingLevel: ModelThinkingLevel;
  observations: Observation[];
  reflections?: Reflection[];
  probe: Parameters<typeof gradeAgentOutput<Reflection[]>>[0]['probe'];
  graders: Parameters<typeof gradeAgentOutput<Reflection[]>>[0]['graders'];
  forceJudge?: boolean;
}): Promise<AgentEvalRecord> {
  const started = Date.now();
  const reflections = args.reflections ?? [];
  const { output, usage, agentDurationMs } = await runReflectorEval(args.model, args.thinkingLevel, { reflections, observations: args.observations });
  return gradeAgentOutput({ id: args.id, agent: 'reflector', output, probe: args.probe, judgeModel: args.judgeModel, started, graders: args.graders, usage: usage.total, agentDurationMs, diagnostics: { observations: args.observations, reflections, forceJudge: args.forceJudge }, noToolCallLabel: 'No record_reflections tool call' });
}

export async function reflectorStaleCurrentReconciliation(model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const observations = [
    obs('aaaaaaaaaaaa', 'Previous decision `apiMode=legacy` is no longer true; current decision is `apiMode=streaming`.', '2026-06-12T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Do not use the legacy API mode in new code; it was rejected after the streaming rollout passed validation.', '2026-06-12T10:01:00.000Z'),
  ];
  const reflections = [ref('eeeeeeeeeeee', 'apiMode=legacy is the current API mode.', ['aaaaaaaaaaaa'])];
  return gradeReflector({
    id: 'reflector-stale-current-reconciliation', model, judgeModel, thinkingLevel, observations, reflections,
    probe: { id: 'reflector-stale-current-reconciliation', question: 'Avoid reinforcing stale active memory and record the current replacement when new evidence says an old reflection is no longer true.', rubric: { pass_if: ['No reflection claims apiMode=legacy is current.', 'A corrective reflection says apiMode=streaming is current and legacy is rejected/stale.'], fail_if: ['Repeats/reinforces apiMode=legacy as current.', 'Ignores replacement relationship.'] } },
    graders: [reflectorForbidsAny('apiMode=legacy is the current'), reflectorSourceIdsAllowed([...observations.map((o) => o.id), ...reflections.map((r) => r.id)]), optional(reflectorRequiresAll('apiMode=streaming')), optional(reflectorRequiresAll('legacy')), optional(reflectorMaxCount(2))],
  });
}

async function realReflector(id: string, fixture: { observations: readonly any[]; reflections?: readonly any[] }, model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, checks: ReturnType<typeof reflectorRequiresAll>[]): Promise<AgentEvalRecord> {
  const observations = fixture.observations.map((observation) => ({ ...observation }));
  const reflections = (fixture.reflections ?? []).map((reflection) => ({ ...reflection }));
  return gradeReflector({
    id, model, judgeModel, thinkingLevel, observations, reflections, forceJudge: true,
    probe: { id, question: `Distill durable active-memory value from ${observations.length} production-shaped observations and ${reflections.length} active reflections mined from the giga OM session.`, rubric: { pass_if: ['Keeps durable user/project decisions.', 'Preserves decision-critical anchors and relationships.', 'Compresses related observations without broad summaries that lose important details.', 'Avoids acknowledgement and tool-receipt noise.'], fail_if: ['Drops main durable decisions.', 'Treats decision-critical anchors as noise.', 'Creates bloated duplicate reflections.', 'Records acknowledgement/tool-receipt noise.'] } },
    graders: [reflectorSourceIdsAllowed([...observations.map((o) => o.id), ...reflections.map((r) => r.id)]), ...checks.map(optional), optional(reflectorMaxCount(Math.ceil(observations.length / 2)))],
  });
}

export const reflectorRealGiga16v2 = (model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel) => realReflector('reflector-real-giga-16-v2', realReflector16v2, model, judgeModel, thinkingLevel, [
  reflectorRequiresAll('reflectorThinking', 'low'),
  reflectorRequiresAll('pinning'),
  reflectorRequiresAll('observations are durable evidence'),
  reflectorRequiresAll('active projection', 'current reflections'),
  reflectorRequiresAll('near-instant', 'non-rewriting'),
  reflectorRequiresAll('typed provenance ids', 'sources'),
  reflectorRequiresAll('full active-memory rewrite'),
  reflectorRequiresAll('reflectionsPoolMaxTokens'),
  reflectorRequiresAll('recall', 'provenance'),
]);

export async function reflectorRealSessionConstraintsAndState(model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const observations = [
    obs('aaaaaaaaaaaa', 'User wants the typed-id migration to fully refactor to Observation.id="obs_*", Reflection.id="ref_*", and Reflection.sources=["obs_*","ref_*"] with no long-lived shims; legacy entries normalize only at boundaries.', '2026-06-14T22:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'User wants tests cleaned up for value, not mechanically renamed: delete curator.test.ts and curator-stage.test.ts because they preserve obsolete pin/curator behavior.', '2026-06-14T22:05:00.000Z'),
    obs('cccccccccccc', 'After cleanup, pin/unpin and curator support are gone from core OM code; MemoryUpdatePhase/MemoryStageName/ResolveMemoryModel/MemoryAgentName omit curator.', '2026-06-14T23:00:00.000Z'),
    obs('dddddddddddd', 'Validation passed: cd extensions/pi-observational-memory && pnpm run typecheck && pnpm test with 19 test files / 149 tests.', '2026-06-14T23:20:00.000Z'),
    obs('eeeeeeeeeeee', 'User decided rewrite input should stay reflections-only for now; runRewrite() takes only reflections and transitive ref -> ref -> obs recall traversal is preserved.', '2026-06-15T01:00:00.000Z'),
    obs('ffffffffffff', 'Deferred task: later investigate OM + fork interaction using instant compaction and always-on memory to send compacted context to forked agents instead of full context; do not investigate it deeply now.', '2026-06-15T01:10:00.000Z'),
  ];
  const reflections = [ref('999999999999', 'OM still has curator pinning and supportingObservationIds as active memory core.', ['aaaaaaaaaaaa'])];
  return gradeReflector({
    id: 'reflector-real-session-constraints-and-state', model, judgeModel, thinkingLevel, observations, reflections,
    probe: { id: 'reflector-real-session-constraints-and-state', question: 'Synthesize real OM session constraints/state while correcting stale curator/pinning active memory.', rubric: { pass_if: ['Typed id/no-shim boundary compatibility retained.', 'Curator/pin removal current state retained.', 'Validation pass retained.', 'Rewrite input reflections-only retained.', 'Deferred OM+fork task retained as later/not now.'], fail_if: ['Resurrects curator/pinning as active.', 'Drops user constraints.', 'Treats deferred fork work as immediate.'] } },
    graders: [reflectorForbidsAny('curator pinning and supportingObservationIds as active memory core'), reflectorSourceIdsAllowed([...observations.map((o) => o.id), ...reflections.map((r) => r.id)]), optional(reflectorRequiresAll('obs_*', 'ref_*')), optional(reflectorRequiresAll('no long-lived shims')), optional(reflectorRequiresAll('curator')), optional(reflectorRequiresAll('19 test files', '149 tests')), optional(reflectorRequiresAll('reflections-only')), optional(reflectorRequiresAll('OM', 'fork')), optional(reflectorMaxCount(6))],
  });
}
