import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord, Reflection } from '../types.js';
import { createUsageCollector, loadOmAgents, ref, resolveModel } from '../runner.js';
import { judgedRewriteScored, reflectorForbidsAny, reflectorMaxCount, reflectorRequiresAll, reflectorSourceIdsAllowed } from '../diagnostics.js';
import { realRewrite40, realRewrite80, realRewrite120 } from './real-session-fixtures.js';

async function runRewriteCase(modelSpec: string, thinkingLevel: ModelThinkingLevel, reflections: Reflection[]) {
  const auth = await resolveModel(modelSpec);
  const { runRewrite } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const result = await runRewrite({ ...auth, reflections, thinkingLevel, maxTurns: 6, onUsage: usage.onUsage });
  return { output: result?.reflections, usage, agentDurationMs: Date.now() - agentStarted };
}

function allowedSources(reflections: Reflection[]): string[] {
  return Array.from(new Set(reflections.flatMap((reflection) => [reflection.id, ...reflection.sources])));
}

export async function rewriteOmMigrationCompression(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const reflections = [
    ref('100000000001', 'Current migration target is Observation.id="obs_*", Reflection.id="ref_*", and Reflection.sources=["obs_*","ref_*"]; legacy ledger/session entries normalize only at boundaries.', ['obs_aaaaaaaaaaaa']),
    ref('100000000002', 'User confirmed the migration should fully refactor to the typed-id shape with no long-lived shims and no parallel legacy core paths.', ['obs_bbbbbbbbbbbb']),
    ref('100000000003', 'Pin/unpin and curator support are gone from core OM code; runtime, config, scheduler, status, and eval infra no longer expose curator-stage logic.', ['obs_cccccccccccc']),
    ref('100000000004', 'eval/src/om is curator-free and has no remaining curator or supportingObservationIds references.', ['obs_dddddddddddd']),
    ref('100000000005', 'Active context projection is reflection-only: nextContextProjection() returns observations: [] and compaction details.observations is [].', ['obs_eeeeeeeeeeee']),
    ref('100000000006', 'Reflector work input still includes observations; observations are hidden from assistant active-context projection but fed to reflector as work input.', ['obs_ffffffffffff']),
    ref('100000000007', 'Latest validation passed: cd extensions/pi-observational-memory && pnpm run typecheck && pnpm test && cd ../../eval && pnpm exec tsc --noEmit.', ['obs_111111111111']),
  ];
  const { output, usage, agentDurationMs } = await runRewriteCase(modelSpec, thinkingLevel, reflections);
  return judgedRewriteScored('rewrite-om-migration-compression', output, {
    id: 'rewrite-om-migration-compression',
    question: 'Compress real OM migration state without losing current typed-id shape, curator removal, reflection-only projection, reflector input distinction, or validation.',
    rubric: { pass_if: ['Current typed-id shape and no-shim rule retained.', 'Curator/pin/supportingObservationIds removal retained as current.', 'Reflection-only projection retained but reflector input distinction retained.', 'Validation command retained.'], fail_if: ['Resurrects curator/pinning as active.', 'Says observations are never used anywhere.', 'Drops validation status.', 'Invents sources.'] },
  }, judgeModel, started, [reflectorSourceIdsAllowed(allowedSources(reflections)), reflectorForbidsAny('curator support is active', 'supportingObservationIds as current')], [reflectorRequiresAll('obs_*', 'ref_*'), reflectorRequiresAll('no long-lived shims'), reflectorRequiresAll('curator'), reflectorRequiresAll('observations: []'), reflectorRequiresAll('reflector'), reflectorRequiresAll('pnpm run typecheck'), reflectorMaxCount(5)], usage.total, agentDurationMs, { reflections });
}

export async function rewriteStaleRelationshipPreservation(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const reflections = [
    ref('200000000001', 'Older plan preferred per-reflection deprecation/supersession lifecycle to retire stale memories individually.', ['obs_aaaaaaaaaaaa']),
    ref('200000000002', 'Current plan explicitly prefers full active-memory rewrite over per-reflection lifecycle/deprecation; rewritten reflections are normal reflections.', ['obs_bbbbbbbbbbbb']),
    ref('200000000003', 'Compaction is near-instant and non-rewriting: only observer tail flush plus deterministic projection, no synchronous reflector/curator/rewrite work.', ['obs_cccccccccccc']),
  ];
  const { output, usage, agentDurationMs } = await runRewriteCase(modelSpec, thinkingLevel, reflections);
  return judgedRewriteScored('rewrite-stale-relationship-preservation', output, {
    id: 'rewrite-stale-relationship-preservation',
    question: 'Preserve current-vs-stale relationship while compressing contradictory memory lifecycle reflections.',
    rubric: { pass_if: ['Full active-memory rewrite is current.', 'Per-reflection lifecycle/deprecation is explicitly not the preferred current plan.', 'Near-instant compaction/no synchronous rewrite retained.'], fail_if: ['Merges both plans as both current.', 'Loses compaction boundary constraint.'] },
  }, judgeModel, started, [reflectorSourceIdsAllowed(allowedSources(reflections))], [reflectorRequiresAll('full active-memory rewrite'), reflectorRequiresAll('per-reflection'), reflectorRequiresAll('near-instant'), reflectorMaxCount(3)], usage.total, agentDurationMs, { reflections });
}

export async function rewriteValidationStatusConsolidation(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const reflections = [
    ref('300000000001', 'Validation of curator second-pass change was blocked because pnpm exec tsc --noEmit could not find tsc and pnpm run typecheck was missing.', ['obs_aaaaaaaaaaaa']),
    ref('300000000002', 'After typed-id cleanup, pnpm run typecheck passed but the broader suite failed: 9 failing files / 29 failing tests, compaction-hook.test.ts hotspot.', ['obs_bbbbbbbbbbbb']),
    ref('300000000003', 'After commit bb12883, cd extensions/pi-observational-memory && pnpm run typecheck && pnpm test passed with 19 files / 147 tests.', ['obs_cccccccccccc']),
    ref('300000000004', 'Latest simplification validation passed: cd extensions/pi-observational-memory && pnpm run typecheck && pnpm test && cd ../../eval && pnpm exec tsc --noEmit.', ['obs_dddddddddddd']),
  ];
  const { output, usage, agentDurationMs } = await runRewriteCase(modelSpec, thinkingLevel, reflections);
  return judgedRewriteScored('rewrite-validation-status-consolidation', output, {
    id: 'rewrite-validation-status-consolidation',
    question: 'Consolidate obsolete failed validations into the latest passing status without saying the work is still blocked.',
    rubric: { pass_if: ['Latest passing extension and eval validation retained.', 'Earlier failures are not presented as current blockers.'], fail_if: ['Says validation is currently blocked/failing.', 'Drops latest command.', 'Invents sources.'] },
  }, judgeModel, started, [reflectorSourceIdsAllowed(allowedSources(reflections)), reflectorForbidsAny('currently blocked', 'still fails', 'broader suite still fails')], [reflectorRequiresAll('pnpm run typecheck'), reflectorRequiresAll('pnpm test'), reflectorRequiresAll('eval'), reflectorRequiresAll('tsc --noEmit'), reflectorMaxCount(2)], usage.total, agentDurationMs, { reflections });
}

export async function rewriteUserConstraintsBundle(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const reflections = [
    ref('400000000001', 'User wants simplifications to keep proceeding across OM until no further simplifications are clearly possible.', ['obs_aaaaaaaaaaaa']),
    ref('400000000002', 'Use pnpm instead of npm in this project.', ['obs_bbbbbbbbbbbb']),
    ref('400000000003', 'For mutable factual claims about files, commands, tests, docs, APIs, installed tools, web facts, or current behavior: verify with tools or cite explicit prior evidence before answering.', ['obs_cccccccccccc']),
    ref('400000000004', 'Future OM code changes should avoid long-lived shims, minimize branching/conditions, and keep compatibility only at boundaries.', ['obs_dddddddddddd']),
    ref('400000000005', 'User wants typed-id migration cleanup to be real test cleanup, not mechanical renaming.', ['obs_eeeeeeeeeeee']),
  ];
  const { output, usage, agentDurationMs } = await runRewriteCase(modelSpec, thinkingLevel, reflections);
  return judgedRewriteScored('rewrite-user-constraints-bundle', output, {
    id: 'rewrite-user-constraints-bundle',
    question: 'Bundle durable user/project constraints compactly without changing their scope.',
    rubric: { pass_if: ['OM simplification preference retained.', 'pnpm retained.', 'evidence discipline retained.', 'No long-lived shims/boundary compatibility retained.', 'Test cleanup not mechanical retained.'], fail_if: ['Drops a high-priority user constraint.', 'Overgeneralizes no-shim rule outside intended scope.', 'Invents sources.'] },
  }, judgeModel, started, [reflectorSourceIdsAllowed(allowedSources(reflections))], [reflectorRequiresAll('simplifications'), reflectorRequiresAll('pnpm'), reflectorRequiresAll('verify'), reflectorRequiresAll('no long-lived shims'), reflectorRequiresAll('real test cleanup'), reflectorMaxCount(4)], usage.total, agentDurationMs, { reflections });
}

async function realRewriteFixtureCase(id: string, fixture: readonly any[], modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, scoreChecks: ReturnType<typeof reflectorRequiresAll>[]): Promise<AgentEvalRecord> {
  const started = Date.now();
  const reflections = fixture.map((reflection) => ({ ...reflection }));
  const { output, usage, agentDurationMs } = await runRewriteCase(modelSpec, thinkingLevel, reflections);
  return judgedRewriteScored(id, output, {
    id,
    question: `Rewrite ${fixture.length} real active reflections mined from the giga OM session into a smaller current memory set.`,
    rubric: { pass_if: ['Preserves central current durable decisions, implementation state, validation facts, and stale/current relationships.', 'Substantially compresses the input while retaining sparse but important current facts.', 'Produces useful handoff memory for a future agent.'], fail_if: ['Drops central current project state.', 'Resurrects stale behavior as current.', 'Fails to compress.'] },
  }, judgeModel, started, [reflectorSourceIdsAllowed(allowedSources(reflections))], [...scoreChecks, reflectorMaxCount(Math.max(8, Math.ceil(fixture.length / 4)))], usage.total, agentDurationMs, { reflections });
}

export async function rewriteRealGiga40(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  return realRewriteFixtureCase('rewrite-real-giga-40', realRewrite40, modelSpec, judgeModel, thinkingLevel, [
    reflectorRequiresAll('/home/syzom/.pi/agent/extensions/pi-observational-memory'),
    reflectorRequiresAll('@docs/ARCHITECTURE_FINDINGS.md', '@docs/future-work.md'),
    reflectorRequiresAll('80-observation cap'),
    reflectorRequiresAll('reflectorThinking', 'xhigh', 'high'),
    reflectorRequiresAll('/home/syzom/.pi/agent/AGENTS.md'),
    reflectorRequiresAll('dropSoftActiveObservationsOver: 30'),
    reflectorRequiresAll('overSoftTarget', 'softDropsAllowed'),
    reflectorRequiresAll('stuckCursorMaxRetries: 3'),
    reflectorRequiresAll('pnpm test', 'pnpm run typecheck'),
  ]);
}

export async function rewriteRealGiga80(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  return realRewriteFixtureCase('rewrite-real-giga-80', realRewrite80, modelSpec, judgeModel, thinkingLevel, [
    reflectorRequiresAll('reviewed', 'visible'),
    reflectorRequiresAll('visibilityProjection'),
    reflectorRequiresAll('tests/session-ledger-projection.test.ts'),
    reflectorRequiresAll('Remove additive mode'),
    reflectorRequiresAll('STRATEGY.additive'),
    reflectorRequiresAll('compaction flush', 'observer-only'),
    reflectorRequiresAll('recall', 'unit-test lookup mechanics', 'model decision'),
    reflectorRequiresAll('validation'),
  ]);
}

export async function rewriteRealGiga120(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  return realRewriteFixtureCase('rewrite-real-giga-120', realRewrite120, modelSpec, judgeModel, thinkingLevel, [
    reflectorRequiresAll('reviewed', 'visible'),
    reflectorRequiresAll('visibilityProjection'),
    reflectorRequiresAll('Remove additive mode'),
    reflectorRequiresAll('compaction flush', 'observer-only'),
    reflectorRequiresAll('recall'),
    reflectorRequiresAll('validation'),
  ]);
}
(rewriteRealGiga120 as any).suite = 'stress';

export async function rewriteDeferredTaskRetention(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const reflections = [
    ref('500000000001', 'After the planned tasks, user wants later follow-up on OM + fork interaction using instant compaction and always-on memory to send compacted context to forked agents instead of full context, to avoid full uncached input cost; do not investigate it deeply now.', ['obs_aaaaaaaaaaaa']),
    ref('500000000002', 'Current next planned work is Stage 5 recall/provenance polish after eval hardening.', ['obs_bbbbbbbbbbbb']),
    ref('500000000003', 'User decided evals should come before recall polish because hard realistic evals test core observer/reflector/rewrite risks.', ['obs_cccccccccccc']),
  ];
  const { output, usage, agentDurationMs } = await runRewriteCase(modelSpec, thinkingLevel, reflections);
  return judgedRewriteScored('rewrite-deferred-task-retention', output, {
    id: 'rewrite-deferred-task-retention',
    question: 'Keep deferred OM+fork work distinct from current eval/recall ordering when compressing priorities.',
    rubric: { pass_if: ['OM+fork retained as later/deferred and not to investigate now.', 'Evals-before-recall ordering retained.', 'Recall polish remains later than eval baseline.'], fail_if: ['Loses deferred OM+fork task.', 'Treats OM+fork as immediate.', 'Moves recall before evals.'] },
  }, judgeModel, started, [reflectorSourceIdsAllowed(allowedSources(reflections))], [reflectorRequiresAll('OM', 'fork'), reflectorRequiresAll('deferred'), reflectorRequiresAll('do not investigate'), reflectorRequiresAll('evals'), reflectorRequiresAll('recall'), reflectorMaxCount(3)], usage.total, agentDurationMs, { reflections });
}
