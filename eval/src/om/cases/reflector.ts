import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord } from '../types.js';
import { createUsageCollector, loadOmAgents, obs, ref, resolveModel } from '../runner.js';
import { judgedReflectorScored, reflectorForbidsAny, reflectorMaxCount, reflectorRequiresAll, reflectorSourceIdsAllowed } from '../diagnostics.js';
import { realReflector8, realReflector16 } from './real-session-fixtures.js';

async function runReflectorCase(modelSpec: string, thinkingLevel: ModelThinkingLevel, args: Record<string, unknown>) {
  const auth = await resolveModel(modelSpec);
  const { runReflector } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runReflector({ ...auth, ...args, thinkingLevel, maxTurns: 6, onUsage: usage.onUsage });
  return { output, usage, agentDurationMs: Date.now() - agentStarted };
}

export async function reflectorStaleCurrentReconciliation(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const observations = [
    obs('aaaaaaaaaaaa', 'Previous decision `apiMode=legacy` is no longer true; current decision is `apiMode=streaming`.', '2026-06-12T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Do not use the legacy API mode in new code; it was rejected after the streaming rollout passed validation.', '2026-06-12T10:01:00.000Z'),
  ];
  const reflections = [ref('eeeeeeeeeeee', 'apiMode=legacy is the current API mode.', ['aaaaaaaaaaaa'])];
  const { output, usage, agentDurationMs } = await runReflectorCase(modelSpec, thinkingLevel, { reflections, observations });
  return judgedReflectorScored('reflector-stale-current-reconciliation', output, {
    id: 'reflector-stale-current-reconciliation',
    question: 'Avoid reinforcing stale active memory and record the current replacement when new evidence says an old reflection is no longer true.',
    rubric: { pass_if: ['No reflection claims apiMode=legacy is current.', 'A corrective reflection says apiMode=streaming is current and legacy is rejected/stale.'], fail_if: ['Repeats/reinforces apiMode=legacy as current.', 'Ignores replacement relationship.'] },
  }, judgeModel, started, [reflectorForbidsAny('apiMode=legacy is the current'), reflectorSourceIdsAllowed([...observations.map((o) => o.id), ...reflections.map((r) => r.id)])], [reflectorRequiresAll('apiMode=streaming'), reflectorRequiresAll('legacy'), reflectorMaxCount(2)], usage.total, agentDurationMs, { observations, reflections });
}

export async function reflectorExactAnchorRetention(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const observations = [
    obs('aaaaaaaaaaaa', 'Exact deploy command that passed is `pnpm --filter api deploy --env=prod --dry-run`.', '2026-06-12T11:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Several later notes loosely call it the prod deploy dry run command without exact flags.', '2026-06-12T11:01:00.000Z'),
    obs('cccccccccccc', 'Assistant paraphrased the deploy check as successful.', '2026-06-12T11:02:00.000Z'),
  ];
  const { output, usage, agentDurationMs } = await runReflectorCase(modelSpec, thinkingLevel, { reflections: [], observations });
  return judgedReflectorScored('reflector-exact-anchor-retention', output, {
    id: 'reflector-exact-anchor-retention',
    question: 'Retain an exact command anchor rather than only paraphrasing noisy near-duplicates.',
    rubric: { pass_if: ['Exact command and flags preserved.'], fail_if: ['Command omitted or flags changed.', 'Only generic deploy success retained.'] },
  }, judgeModel, started, [reflectorSourceIdsAllowed(observations.map((o) => o.id))], [reflectorRequiresAll('pnpm --filter api deploy --env=prod --dry-run'), reflectorMaxCount(2)], usage.total, agentDurationMs, { observations });
}

export async function reflectorSupersessionRelation(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const observations = [
    obs('aaaaaaaaaaaa', 'Canonical approved feature flag is `fast_sync_v2_enabled`, which supersedes `enableFastSync`; near-match to reject is `enableFastSync`.', '2026-06-07T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Repeated red-herring records say `enableFastSync` is a similar stale value explicitly not current for the final task.', '2026-06-07T10:01:00.000Z'),
  ];
  const { output, usage, agentDurationMs } = await runReflectorCase(modelSpec, thinkingLevel, { reflections: [], observations });
  return judgedReflectorScored('reflector-supersession-relation', output, {
    id: 'reflector-supersession-relation',
    question: 'Preserve the replacement/supersession relation, not just current-vs-stale labels.',
    rubric: { pass_if: ['fast_sync_v2_enabled current/canonical.', 'enableFastSync stale/rejected.', 'Supersedes/replaces relationship explicit.'], fail_if: ['Relationship omitted.', 'enableFastSync ambiguous/current.', 'Sources invented.'] },
  }, judgeModel, started, [reflectorSourceIdsAllowed(observations.map((o) => o.id))], [reflectorRequiresAll('fast_sync_v2_enabled'), reflectorRequiresAll('enableFastSync'), reflectorRequiresAll('supersedes'), reflectorMaxCount(2)], usage.total, agentDurationMs, { observations });
}

export async function reflectorRestraintAlreadyCovered(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const observations = [
    obs('aaaaaaaaaaaa', 'Assistant said okay.', '2026-06-07T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'User said thanks.', '2026-06-07T10:01:00.000Z'),
    obs('cccccccccccc', 'Current OM config file is `/etc/pi/om.json`; the key is `reflectorThinking` and default is `low`.', '2026-06-12T12:00:00.000Z'),
  ];
  const reflections = [ref('eeeeeeeeeeee', 'Current OM config file is /etc/pi/om.json; reflectorThinking default is low.', ['cccccccccccc'])];
  const { output, usage, agentDurationMs } = await runReflectorCase(modelSpec, thinkingLevel, { reflections, observations });
  return judgedReflectorScored('reflector-restraint-already-covered', output, {
    id: 'reflector-restraint-already-covered',
    question: 'Avoid duplicate/noisy reflections for acknowledgement-only observations and evidence already covered by current reflections.',
    rubric: { pass_if: ['Output empty or at most one genuinely corrective reflection.', 'No duplicate of existing config reflection.', 'No thanks/okay reflection.'], fail_if: ['Duplicates covered config fact.', 'Records acknowledgement noise.'] },
  }, judgeModel, started, [reflectorForbidsAny('okay', 'thanks'), reflectorMaxCount(1), reflectorSourceIdsAllowed([...observations.map((o) => o.id), ...reflections.map((r) => r.id)])], [], usage.total, agentDurationMs, { observations, reflections });
}

async function realReflectorFixtureCase(id: string, fixture: readonly any[], modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, scoreChecks: ReturnType<typeof reflectorRequiresAll>[]): Promise<AgentEvalRecord> {
  const started = Date.now();
  const observations = fixture.map((observation) => ({ ...observation }));
  const { output, usage, agentDurationMs } = await runReflectorCase(modelSpec, thinkingLevel, { reflections: [], observations });
  return judgedReflectorScored(id, output, {
    id,
    question: `Distill the durable active-memory value from ${fixture.length} real recorded observations mined from the giga OM session. Compress related observations; do not produce one reflection per observation unless each observation carries distinct durable value.`,
    rubric: { pass_if: ['Keeps the main durable user/project decisions and exact implementation/validation anchors present in the observations.', 'Compresses related observations without requiring one reflection per observation.', 'Avoids acknowledgement and tool-receipt noise.'], fail_if: ['Drops the main durable decisions or anchors present in the observations.', 'Creates bloated duplicate reflections.', 'Records acknowledgement/tool-receipt noise as durable memory.'] },
  }, judgeModel, started, [reflectorSourceIdsAllowed(observations.map((o) => o.id))], [...scoreChecks, reflectorMaxCount(Math.ceil(fixture.length / 2))], usage.total, agentDurationMs, { observations });
}

export async function reflectorRealGiga8(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  return realReflectorFixtureCase('reflector-real-giga-8', realReflector8, modelSpec, judgeModel, thinkingLevel, [
    reflectorRequiresAll('pi-observational-memory'),
    reflectorRequiresAll('@docs/ARCHITECTURE_FINDINGS.md', '@docs/future-work.md'),
    reflectorRequiresAll('80-observation cap'),
    reflectorRequiresAll('recall tool', 'model evals'),
    reflectorRequiresAll('progressive', 'compaction', '@extensions/pi-fork/'),
    reflectorRequiresAll('/home/syzom/.pi/agent/AGENTS.md'),
    reflectorRequiresAll('mutable factual claims', 'verify'),
    reflectorRequiresAll('OpenAI', 'Anthropic'),
  ]);
}

export async function reflectorRealGiga16(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  return realReflectorFixtureCase('reflector-real-giga-16', realReflector16, modelSpec, judgeModel, thinkingLevel, [
    reflectorRequiresAll('/home/syzom/.pi/agent/extensions/pi-observational-memory'),
    reflectorRequiresAll('STRATEGY', 'additive', 'replacement', 'off'),
    reflectorRequiresAll('dropWhenActiveObservationsOver: 80'),
    reflectorRequiresAll('reflectorThinking', 'xhigh'),
    reflectorRequiresAll('dropSoftActiveObservationsOver: 30'),
    reflectorRequiresAll('overSoftTarget', 'softDropsAllowed'),
    reflectorRequiresAll('tests/dropper-pool.test.ts', 'tests/config.test.ts', 'tests/memory-update.test.ts', 'tests/status-command.test.ts'),
    reflectorRequiresAll('23 files', '155 tests'),
    reflectorRequiresAll('pnpm approve-builds --all'),
    reflectorRequiresAll('stuckCursorMaxRetries: 3'),
  ]);
}

export async function reflectorRealSessionConstraintsAndState(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const observations = [
    obs('aaaaaaaaaaaa', 'User wants the typed-id migration to fully refactor to Observation.id="obs_*", Reflection.id="ref_*", and Reflection.sources=["obs_*","ref_*"] with no long-lived shims; legacy entries normalize only at boundaries.', '2026-06-14T22:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'User wants tests cleaned up for value, not mechanically renamed: delete curator.test.ts and curator-stage.test.ts because they preserve obsolete pin/curator behavior.', '2026-06-14T22:05:00.000Z'),
    obs('cccccccccccc', 'After cleanup, pin/unpin and curator support are gone from core OM code; MemoryUpdatePhase/MemoryStageName/ResolveMemoryModel/MemoryAgentName omit curator.', '2026-06-14T23:00:00.000Z'),
    obs('dddddddddddd', 'Validation passed: cd extensions/pi-observational-memory && pnpm run typecheck && pnpm test with 19 test files / 149 tests.', '2026-06-14T23:20:00.000Z'),
    obs('eeeeeeeeeeee', 'User decided rewrite input should stay reflections-only for now; runRewrite() takes only reflections and transitive ref -> ref -> obs recall traversal is preserved.', '2026-06-15T01:00:00.000Z'),
    obs('ffffffffffff', 'Deferred task: later investigate OM + fork interaction using instant compaction and always-on memory to send compacted context to forked agents instead of full context; do not investigate it deeply now.', '2026-06-15T01:10:00.000Z'),
  ];
  const reflections = [ref('999999999999', 'OM still has curator pinning and supportingObservationIds as active memory core.', ['aaaaaaaaaaaa'])];
  const { output, usage, agentDurationMs } = await runReflectorCase(modelSpec, thinkingLevel, { reflections, observations });
  return judgedReflectorScored('reflector-real-session-constraints-and-state', output, {
    id: 'reflector-real-session-constraints-and-state',
    question: 'Synthesize real OM session constraints/state while correcting stale curator/pinning active memory.',
    rubric: { pass_if: ['Typed id/no-shim boundary compatibility retained.', 'Curator/pin removal current state retained.', 'Validation pass retained.', 'Rewrite input reflections-only retained.', 'Deferred OM+fork task retained as later/not now.'], fail_if: ['Resurrects curator/pinning as active.', 'Drops user constraints.', 'Treats deferred fork work as immediate.'] },
  }, judgeModel, started, [reflectorForbidsAny('curator pinning and supportingObservationIds as active memory core'), reflectorSourceIdsAllowed([...observations.map((o) => o.id), ...reflections.map((r) => r.id)])], [reflectorRequiresAll('obs_*', 'ref_*'), reflectorRequiresAll('no long-lived shims'), reflectorRequiresAll('curator'), reflectorRequiresAll('19 test files', '149 tests'), reflectorRequiresAll('reflections-only'), reflectorRequiresAll('OM', 'fork'), reflectorMaxCount(6)], usage.total, agentDurationMs, { observations, reflections });
}
