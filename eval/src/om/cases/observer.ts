import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { Probe } from '../../lib/types.js';
import type { AgentEvalRecord, Observation, OmEvalOptions, OmGrader } from '../types.js';
import { runObserverEval } from '../agent-runner.js';
import { gradeAgentOutput, observerForbidsAny, observerForbidsSourceIds, observerMaxCount, observerRequiresAll, observerSourceIdsAllowed, optional } from '../diagnostics.js';
import { realObserver32 } from './real-session-fixtures.js';
import { realObserver64 as realObserver64v2 } from './real-session-fixtures-v2.js';

type ObserverFixture = { readonly count: number; readonly chunk: string; readonly allowedSourceEntryIds: readonly string[] };

async function runCase(model: string, thinkingLevel: ModelThinkingLevel, chunk: string, allowedSourceEntryIds: readonly string[]) {
  return runObserverEval(model, thinkingLevel, { chunk, allowedSourceEntryIds: [...allowedSourceEntryIds] });
}

async function gradeObserver(args: {
  id: string;
  model: string;
  judgeModel: string;
  thinkingLevel: ModelThinkingLevel;
  chunk: string;
  allowedSourceEntryIds: readonly string[];
  probe: Probe;
  graders: OmGrader<Observation[]>[];
  diagnostics?: Record<string, unknown>;
}): Promise<AgentEvalRecord> {
  const started = Date.now();
  const { output, usage, agentDurationMs } = await runCase(args.model, args.thinkingLevel, args.chunk, args.allowedSourceEntryIds);
  return gradeAgentOutput({ id: args.id, agent: 'observer', output, probe: args.probe, judgeModel: args.judgeModel, started, graders: args.graders, usage: usage.total, agentDurationMs, diagnostics: { skipJudge: true, ...args.diagnostics, chunk: args.chunk }, noToolCallLabel: 'No record_observations tool call' });
}

export async function observerToolEvidenceBoundary(model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const chunk = [
    '[Source entry id: user-tool-a] [User @ 2026-06-11 20:00]: Current route: src/app/api/[org]/route.ts for org-scoped endpoints.',
    '[Source entry id: tool-tool-b]\n[Tool evidence: bash @ 2026-06-11 20:01]\nstatus: error\ninput: pnpm test tests/api-org.test.ts\nexitCode: 1\noutput_omitted: false\nexcerpt:\nFAIL tests/api-org.test.ts > org-scoped > missing header\nExpected 401\nReceived 200',
    '[Source entry id: tool-tool-d]\n[Tool evidence: read @ 2026-06-11 20:03]\nstatus: ok\ninput: src/app/api/[org]/route.ts\noutput_omitted: true (policy)\nexcerpt:\n[output omitted by observer policy]',
    '[Source entry id: user-tool-e] [User @ 2026-06-11 20:04]: Use JWT not session. Add org-id claim. Keep the test blocked until the header is served.',
    '[Source entry id: user-success-a] [User @ 2026-06-11 23:00]: The db helper module is exported as `createDbClient` from src/db/client.ts and takes options `{ url, maxRetries, logQueries }`.',
    '[Source entry id: tool-success-b]\n[Tool evidence: bash @ 2026-06-11 23:01]\nstatus: ok\ninput: pnpm test tests/db-client.test.ts\nexitCode: 0\noutput_omitted: false\nexcerpt:\nPASS tests/db-client.test.ts > createDbClient defaults maxRetries to 3\nPASS tests/db-client.test.ts > createDbClient disables logQueries by default',
    '[Source entry id: tool-budget-c]\n[Tool evidence: bash @ 2026-06-11 22:02]\nstatus: error\ninput: pnpm test tests/auth-refresh.test.ts\nexitCode: 1\noutput_omitted: true (length)\nexcerpt:\n[output omitted because observer input budget was exhausted]',
    '[Source entry id: assistant-budget-d] [Assistant @ 2026-06-11 22:03]: I need to rerun auth with a larger excerpt before claiming the exact failure.',
  ].join('\n\n');
  return gradeObserver({
    id: 'observer-tool-evidence-boundary', model, judgeModel, thinkingLevel, chunk,
    allowedSourceEntryIds: ['user-tool-a', 'tool-tool-b', 'tool-tool-d', 'user-tool-e', 'user-success-a', 'tool-success-b', 'tool-budget-c', 'assistant-budget-d'],
    probe: { id: 'observer-tool-evidence-boundary', question: 'Preserve actionable visible tool evidence while avoiding omitted read/output metadata and invented failures.', rubric: { pass_if: ['Route/test/JWT/org-id failure retained.', 'createDbClient API and passing default validation retained.', 'No invented auth-refresh failure from omitted output.'], fail_if: ['Records omitted read snippets or output metadata.', 'Invents exact auth-refresh failure.', 'Drops visible pass/fail evidence.'] } },
    graders: [observerForbidsAny('output_omitted', 'output omitted by observer policy', 'input budget was exhausted'), observerForbidsSourceIds('tool-tool-d', 'tool-budget-c'), observerForbidsAny('A read was run', 'read was run'), optional(observerRequiresAll('tests/api-org.test.ts', '401', '200')), optional(observerRequiresAll('JWT', 'org-id')), optional(observerRequiresAll('createDbClient', 'src/db/client.ts')), optional(observerRequiresAll('maxRetries', '3', 'logQueries')), optional(observerMaxCount(8))],
  });
}

async function realObserver(id: string, fixture: ObserverFixture, model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, checks: ReturnType<typeof observerRequiresAll>[]): Promise<AgentEvalRecord> {
  return gradeObserver({
    id, model, judgeModel, thinkingLevel, chunk: fixture.chunk, allowedSourceEntryIds: fixture.allowedSourceEntryIds,
    probe: { id, question: `Extract concrete source-backed OM observations from a real giga-session observer chunk with ${fixture.count} serialized source entries.`, rubric: { pass_if: ['Source-close evidence, not active-memory conclusions.', 'Main user statements, visible results/errors, named changes, blockers, and exact anchors are covered.', 'Exact anchors such as file paths, config names, command/test names, counts, thresholds, and named functions/events are retained when visible.', 'Low-value telemetry is omitted unless it contains a named result, error, blocker, validation target, or source payload.'], fail_if: ['Records omitted-output/read receipts as evidence.', 'Loses concrete evidence payloads or validation evidence.', 'Converts concrete source evidence into broad active-memory conclusions.', 'Synthesizes active-memory conclusions not directly supported by the visible source.'] } },
    graders: [observerSourceIdsAllowed([...fixture.allowedSourceEntryIds]), observerForbidsAny('output omitted by observer policy', 'Successfully replaced', 'Successfully wrote', '[thinking omitted]'), ...checks.map(optional)],
    diagnostics: { sourceEntryCount: fixture.count },
  });
}

export const observerRealGiga32 = (model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, _options?: OmEvalOptions) => realObserver('observer-real-giga-32', realObserver32, model, judgeModel, thinkingLevel, [
  observerRequiresAll('docs/ARCHITECTURE_FINDINGS.md', 'docs/future-work.md'),
  observerRequiresAll('80', 'observations', 'cap'),
  observerRequiresAll('recall', 'eval'),
  observerRequiresAll('mutable factual claims', 'verify'),
]);

export const observerRealGiga64v2 = (model: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, _options?: OmEvalOptions) => realObserver('observer-real-giga-64-v2', realObserver64v2, model, judgeModel, thinkingLevel, [
  observerRequiresAll('supportingObservationIds', 'mechanically'),
  observerRequiresAll('613', '178'),
  observerRequiresAll('thinking', 'xhigh'),
]);
