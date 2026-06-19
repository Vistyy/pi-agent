import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord, Reflection } from '../types.js';
import { runRewriteEval } from '../agent-runner.js';
import { ref } from '../runner.js';
import { gradeAgentOutput, optional, reflectorMaxCount, reflectorRequiresAll, reflectorSourceIdsAllowed } from '../diagnostics.js';
import { realRewrite80 } from './real-session-fixtures.js';
import { realRewrite40 as realRewrite40v2 } from './real-session-fixtures-v2.js';

const allowedSources = (reflections: Reflection[]) => Array.from(new Set(reflections.flatMap((reflection) => [reflection.id, ...reflection.sources])));

async function gradeRewrite(args: {
  id: string;
  model: string;
  judgeModel: string;
  thinkingLevel: ModelThinkingLevel;
  reflections: Reflection[];
  probe: Parameters<typeof gradeAgentOutput<Reflection[]>>[0]['probe'];
  graders: Parameters<typeof gradeAgentOutput<Reflection[]>>[0]['graders'];
  forceJudge?: boolean;
}): Promise<AgentEvalRecord> {
  const started = Date.now();
  const { output, usage, agentDurationMs, providerError } = await runRewriteEval(args.model, args.thinkingLevel, args.reflections);
  return gradeAgentOutput({ id: args.id, agent: 'rewrite', output, probe: args.probe, judgeModel: args.judgeModel, started, graders: args.graders, usage: usage.total, agentDurationMs, diagnostics: { reflections: args.reflections, forceJudge: args.forceJudge, providerError }, providerError });
}

export async function rewriteStaleRelationshipPreservation(model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const reflections = [
    ref('200000000001', 'Older plan preferred per-reflection deprecation/supersession lifecycle to retire stale memories individually.', ['obs_aaaaaaaaaaaa']),
    ref('200000000002', 'Current plan explicitly prefers full active-memory rewrite over per-reflection lifecycle/deprecation; rewritten reflections are normal reflections.', ['obs_bbbbbbbbbbbb']),
    ref('200000000003', 'Compaction is near-instant and non-rewriting: only observer tail flush plus deterministic projection, no synchronous reflector/curator/rewrite work.', ['obs_cccccccccccc']),
  ];
  return gradeRewrite({
    id: 'rewrite-stale-relationship-preservation', model, judgeModel, thinkingLevel, reflections,
    probe: { id: 'rewrite-stale-relationship-preservation', question: 'Preserve current-vs-stale relationship while compressing contradictory memory lifecycle reflections.', rubric: { pass_if: ['Full active-memory rewrite is current.', 'Per-reflection lifecycle/deprecation is explicitly not the preferred current plan.', 'Near-instant compaction/no synchronous rewrite retained.'], fail_if: ['Merges both plans as both current.', 'Loses compaction boundary constraint.'] } },
    graders: [reflectorSourceIdsAllowed(allowedSources(reflections)), optional(reflectorRequiresAll('full active-memory rewrite')), optional(reflectorRequiresAll('per-reflection')), optional(reflectorRequiresAll('near-instant')), optional(reflectorMaxCount(3))],
  });
}

async function realRewrite(id: string, fixture: readonly any[], model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, checks: ReturnType<typeof reflectorRequiresAll>[]): Promise<AgentEvalRecord> {
  const reflections = fixture.map((reflection) => ({ ...reflection }));
  return gradeRewrite({
    id, model, judgeModel, thinkingLevel, reflections, forceJudge: true,
    probe: { id, question: `Rewrite ${fixture.length} real active reflections mined from the giga OM session into a smaller current memory set. Prefer latest concrete current state over older implementation history, while preserving stale/current relationships and decision-critical anchors.`, rubric: { pass_if: ['Preserves central current decisions, implementation state, validation facts, and stale/current relationships.', 'Keeps exact anchors when they define the memory.', 'Drops obsolete operational trail unless needed to explain current state.', 'Substantially compresses input.', 'Produces useful handoff memory.'], fail_if: ['Drops central current state or decision-critical anchors.', 'Resurrects stale behavior as current.', 'Keeps obsolete operational details at the expense of current memory.', 'Fails to compress.'] } },
    graders: [reflectorSourceIdsAllowed(allowedSources(reflections)), ...checks.map(optional), optional(reflectorMaxCount(Math.max(8, Math.ceil(fixture.length / 4))))],
  });
}

export const rewriteRealGiga80 = (model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel) => realRewrite('rewrite-real-giga-80', realRewrite80, model, judgeModel, thinkingLevel, [
  reflectorRequiresAll('visibilityProjection'),
  reflectorRequiresAll('Remove additive mode', 'STRATEGY.additive'),
  reflectorRequiresAll('compaction flush', 'observer-only'),
  reflectorRequiresAll('recall', 'model decision'),
  reflectorRequiresAll('validation'),
]);

export const rewriteRealGiga40v2 = (model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel) => realRewrite('rewrite-real-giga-40-v2', realRewrite40v2, model, judgeModel, thinkingLevel, [
  reflectorRequiresAll('OM', 'fork'),
  reflectorRequiresAll('curator'),
  reflectorRequiresAll('reflectorThinking', 'low'),
  reflectorRequiresAll('observations are durable evidence'),
  reflectorRequiresAll('pin'),
  reflectorRequiresAll('reflection-only'),
  reflectorRequiresAll('typed provenance ids', 'sources'),
  reflectorRequiresAll('full active-memory rewrite'),
  reflectorRequiresAll('recall'),
]);
