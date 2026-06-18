import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord, OmEvalOptions } from '../types.js';
import { runObserverEval } from '../agent-runner.js';
import { gradeAgentOutput, observerForbidsAny, observerForbidsSourceIds, observerMaxCount, observerRequiresAll, observerSourceIdsAllowed, optional } from '../diagnostics.js';
import { realObserver32, realObserver64, realObserver96 } from './real-session-fixtures.js';
import { realObserver64 as realObserver64v2 } from './real-session-fixtures-v2.js';

async function runObserverCase(modelSpec: string, thinkingLevel: ModelThinkingLevel, chunk: string, allowedSourceEntryIds: string[]) {
  return runObserverEval(modelSpec, thinkingLevel, { chunk, allowedSourceEntryIds });
}

export async function observerStateStaleBlocker(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, options?: OmEvalOptions): Promise<AgentEvalRecord> {
  const started = Date.now();
  const entries = [
    ['user-a', '2026-06-07 10:00 User: Earlier I said Redis for job state, but reject that now. Current rule: use SQLite at /tmp/jobs.db.'],
    ['assistant-b', '2026-06-07 10:03 Assistant: Ran `npm run migrate -- --dry-run`; result was `Error: SQLITE_BUSY at src/db/migrate.ts:88`.'],
    ['user-c', '2026-06-07 10:04 User: That SQLITE_BUSY is the blocker. Keep WAL enabled via `PRAGMA journal_mode=WAL`.'],
    ['assistant-d', '2026-06-07 10:05 Assistant: I changed the parser entrypoint from src/parser.ts to src/parser/index.ts.'],
    ['tool-e', '2026-06-07 10:06 Tool result: npm test failed: FAIL tests/parser-regression.test.ts > keeps CRLF offsets. Expected column 17, received column 16.'],
    ['user-f', '2026-06-07 10:07 User: Do not call that fixed. The CRLF offset failure is still unresolved.'],
    ['assistant-g', '2026-06-07 10:08 Assistant: Okay.'],
  ];
  const chunk = entries.map(([id, text]) => `[Source entry id: ${id}] ${text}`).join('\n');
  const { output, usage, agentDurationMs } = await runObserverCase(modelSpec, thinkingLevel, chunk, entries.map(([id]) => id));
  const probe = {
    id: 'observer-state-stale-blocker',
    question: 'Preserve current/stale state, exact blockers, tool evidence, and unresolved status without acknowledgement noise.',
    rubric: { pass_if: ['Redis rejected and SQLite /tmp/jobs.db current.', 'SQLITE_BUSY path/command and WAL requirement retained.', 'Parser entrypoint change and CRLF test failure retained with unresolved status.'], fail_if: ['Stale Redis treated current.', 'CRLF failure called fixed.', 'Exact command/path/test values lost.', 'Ack recorded as durable memory.'] },
  };
  return gradeAgentOutput({ id: 'observer-state-stale-blocker', agent: 'observer', output, probe, judgeModel, started, graders: [observerForbidsSourceIds('assistant-g'), optional(observerRequiresAll('SQLite', '/tmp/jobs.db')), optional(observerRequiresAll('SQLITE_BUSY', 'src/db/migrate.ts:88')), optional(observerRequiresAll('PRAGMA journal_mode=WAL')), optional(observerRequiresAll('src/parser.ts', 'src/parser/index.ts')), optional(observerRequiresAll('tests/parser-regression.test.ts', '17', '16')), optional(observerMaxCount(5))], usage: usage.total, agentDurationMs, diagnostics: { chunk }, noToolCallLabel: 'No record_observations tool call' });
}

export async function observerToolEvidenceBoundary(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
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
  const ids = ['user-tool-a', 'tool-tool-b', 'tool-tool-d', 'user-tool-e', 'user-success-a', 'tool-success-b', 'tool-budget-c', 'assistant-budget-d'];
  const { output, usage, agentDurationMs } = await runObserverCase(modelSpec, thinkingLevel, chunk, ids);
  return gradeAgentOutput({ id: 'observer-tool-evidence-boundary', agent: 'observer', output, probe: {
    id: 'observer-tool-evidence-boundary',
    question: 'Preserve actionable visible tool evidence while avoiding omitted read/output metadata and invented failures.',
    rubric: { pass_if: ['Route/test/JWT/org-id failure retained.', 'createDbClient API and passing default validation retained.', 'No invented auth-refresh failure from omitted output.'], fail_if: ['Records omitted read snippets or output metadata.', 'Invents exact auth-refresh failure.', 'Drops visible pass/fail evidence.'] },
  }, judgeModel, started, graders: [observerForbidsAny('output_omitted', 'output omitted by observer policy', 'input budget was exhausted'), optional(observerRequiresAll('tests/api-org.test.ts', '401', '200')), optional(observerRequiresAll('JWT', 'org-id')), optional(observerRequiresAll('createDbClient', 'src/db/client.ts')), optional(observerRequiresAll('maxRetries', '3', 'logQueries')), optional(observerMaxCount(7))], usage: usage.total, agentDurationMs, noToolCallLabel: 'No record_observations tool call' });
}

export async function observerExactLanguageFutureIntent(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const chunk = [
    '[Source entry id: user-schema-a] User: For the durable ledger we agreed on the custom event `om.observations.flagged`. It has `observationIds` and a bounded one-line `reason`; do not turn this into a generic follow-up marker.',
    '[Source entry id: user-schema-c] User: Also keep the future reflection lifecycle names exact: `om.reflections.deprecated` and `om.reflections.superseded`. They are proposed future events, not implemented yet.',
    '[Source entry id: tool-schema-d] Tool result: grep also shows stale older notes mentioning dropper soft threshold, additive mode, and reflectorThinking xhigh; those are not the current schema names.',
    '[Source entry id: user-future-a] User: Next finish the observer provenance policy, then add deterministic checks for observer evals. Maybe revisit docs cleanup if evals still look noisy.',
    '[Source entry id: assistant-f] Assistant: Okay, noted.',
  ].join('\n');
  const ids = ['user-schema-a', 'user-schema-c', 'tool-schema-d', 'user-future-a', 'assistant-f'];
  const { output, usage, agentDurationMs } = await runObserverCase(modelSpec, thinkingLevel, chunk, ids);
  return gradeAgentOutput({ id: 'observer-exact-language-future-intent', agent: 'observer', output, probe: {
    id: 'observer-exact-language-future-intent',
    question: 'Preserve exact API/event names and future/tentative sequencing without promoting stale distractions.',
    rubric: { pass_if: ['Exact event/field names retained.', 'Deprecated/superseded are proposed future, not implemented.', 'Observer provenance policy precedes deterministic checks; docs cleanup tentative.'], fail_if: ['Generic flags replace exact names.', 'Future events treated implemented.', 'Maybe docs cleanup treated immediate/approved.'] },
  }, judgeModel, started, graders: [observerForbidsSourceIds('assistant-f'), optional(observerRequiresAll('om.observations.flagged', 'observationIds', 'reason')), optional(observerRequiresAll('om.reflections.deprecated', 'om.reflections.superseded')), optional(observerRequiresAll('proposed')), optional(observerRequiresAll('observer provenance policy', 'deterministic')), optional(observerRequiresAll('docs cleanup')), optional(observerMaxCount(5))], usage: usage.total, agentDurationMs, noToolCallLabel: 'No record_observations tool call' });
}

export async function observerRealSessionScaleOmSimplification(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const chunk = [
    '[Source entry id: s1] [User @ 2026-06-14T21:00] after these tasks i want to look at OM/fork combo, where thanks to instant compaction and always on memory we can send compacted context to forked agents instead of full context, and having to pay the full uncached input price. do not look into it too deeply now.',
    '[Source entry id: s2] [Tool evidence: edit] status: ok input: extensions/pi-observational-memory/docs/implementation-plan.md excerpt: Successfully replaced 1 block(s).',
    '[Source entry id: s3] [Assistant] Added deferred OM + fork note to implementation-plan.md.',
    '[Source entry id: s4] [User] User confirmed the migration should fully refactor to the new typed-id shape with no long-lived shims; compatibility only at boundaries, not parallel legacy core paths.',
    '[Source entry id: s5] [Assistant] Implemented typed ids in src/memory/ids.ts, src/session-ledger/types.ts, fold.ts, recall.ts.',
    '[Source entry id: s6] [Tool evidence: bash] status: ok input: cd extensions/pi-observational-memory && pnpm run typecheck && pnpm test exitCode: 0 excerpt: Test Files 19 passed; Tests 149 passed.',
    '[Source entry id: s7] [User] Delete curator.test.ts and curator-stage.test.ts; they preserve obsolete pin/curator behavior. Keep typed ids, reflection-only active memory, recall traversal, compaction-hook behavior, and status/view outputs.',
    '[Source entry id: s8] [Tool evidence: bash] status: error input: pnpm test -- tests/session-ledger-fold.test.ts tests/session-ledger-render-summary.test.ts exitCode: 1 excerpt: 9 failing files / 29 failing tests; compaction-hook.test.ts is a main hotspot.',
    '[Source entry id: s9] [Assistant] Later validation passed after memory-update.test.ts edit: cd extensions/pi-observational-memory && pnpm run typecheck && pnpm test passed with 19 test files / 149 tests.',
    '[Source entry id: s10] [User] Rewrite input should stay reflections-only for now; do not include source observations in rewrite input.',
    '[Source entry id: s11] [Assistant] Committed 666a1c5 Keep rewrite input reflection-only; transitive ref -> ref -> obs recall traversal is preserved.',
    '[Source entry id: s12] [Tool evidence: read] status: ok input: eval/src/om/cases/curator.ts output_omitted: true excerpt: [output omitted by observer policy]',
    '[Source entry id: s13] [Assistant] eval/src/om is curator-free and no longer references supportingObservationIds.',
    '[Source entry id: s14] [User] Nice.',
  ].join('\n\n');
  const ids = Array.from({ length: 14 }, (_, i) => `s${i + 1}`);
  const { output, usage, agentDurationMs } = await runObserverCase(modelSpec, thinkingLevel, chunk, ids);
  return gradeAgentOutput({ id: 'observer-real-session-scale-om-simplification', agent: 'observer', output, probe: {
    id: 'observer-real-session-scale-om-simplification',
    question: 'From realistic noisy OM work, retain durable decisions, validation transitions, and deferred work without workflow receipts.',
    rubric: { pass_if: ['Deferred OM+fork task retained with do-not-investigate-now.', 'Typed-id/no-shim boundary compatibility decision retained.', 'Curator tests deletion rationale and reflection-only kept coverage retained.', 'Failed then passed validation chronology retained.', 'Rewrite input reflections-only retained.'], fail_if: ['Treats deferred OM+fork as immediate.', 'Says tests only failed or only passed without chronology.', 'Records edit/read receipts as durable facts.', 'Includes output omitted policy noise.'] },
  }, judgeModel, started, graders: [observerForbidsAny('Successfully replaced', 'output omitted by observer policy', 'Nice'), optional(observerRequiresAll('OM', 'fork', 'do not look into it too deeply')), optional(observerRequiresAll('typed-id', 'no long-lived shims')), optional(observerRequiresAll('curator.test.ts', 'curator-stage.test.ts')), optional(observerRequiresAll('9 failing files', '29 failing tests')), optional(observerRequiresAll('19 test files', '149 tests')), optional(observerRequiresAll('reflections-only')), optional(observerMaxCount(8))], usage: usage.total, agentDurationMs, noToolCallLabel: 'No record_observations tool call' });
}

type RealObserverFixture = { readonly count: number; readonly chunk: string; readonly allowedSourceEntryIds: readonly string[] };

async function realObserverFixtureCase(id: string, fixture: RealObserverFixture, modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, scoreChecks: ReturnType<typeof observerRequiresAll>[], options?: OmEvalOptions): Promise<AgentEvalRecord> {
  const started = Date.now();
  const { output, usage, agentDurationMs } = await runObserverCase(modelSpec, thinkingLevel, fixture.chunk, [...fixture.allowedSourceEntryIds]);
  const probe = {
    id,
    question: `Extract concrete source-backed OM observations from a real giga-session observer chunk with ${fixture.count} serialized source entries.`,
    rubric: { pass_if: ['Observations are source-close evidence payloads, not active-memory conclusions.', 'The main user statements, visible results/errors, named changes, blockers, and exact anchors from the noisy slice are reasonably covered.', 'Assistant summaries are acceptable source evidence when they are the visible source, but must be attributed as reported claims rather than treated as primary truth.', 'Low-value workflow telemetry is omitted unless the visible output contains a named result, error, blocker, validation target, or source payload.'], fail_if: ['Records omitted-output/read receipts as evidence.', 'Loses the main concrete evidence payloads or validation evidence.', 'Synthesizes active-memory conclusions not directly supported by the visible source.', 'Penalizes reported assistant summaries solely because their underlying primary source is not included in the fixture.'] },
  };
  return gradeAgentOutput({ id, agent: 'observer', output, probe, judgeModel, started, graders: [observerSourceIdsAllowed([...fixture.allowedSourceEntryIds]), observerForbidsAny('output omitted by observer policy', 'Successfully replaced', 'Successfully wrote', '[thinking omitted]'), ...scoreChecks.map(optional)], usage: usage.total, agentDurationMs, diagnostics: { sourceEntryCount: fixture.count, forceJudge: true, chunk: fixture.chunk }, noToolCallLabel: 'No record_observations tool call' });
}

export async function observerRealGiga32(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, options?: OmEvalOptions): Promise<AgentEvalRecord> {
  return realObserverFixtureCase('observer-real-giga-32', realObserver32, modelSpec, judgeModel, thinkingLevel, [
    observerRequiresAll('@docs/ARCHITECTURE_FINDINGS.md', '@docs/future-work.md'),
    observerRequiresAll('80', 'observations', 'cap'),
    observerRequiresAll('recall', 'model evals'),
    observerRequiresAll('mutable factual claims', 'verify'),
  ], options);
}

export async function observerRealGiga64(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, options?: OmEvalOptions): Promise<AgentEvalRecord> {
  return realObserverFixtureCase('observer-real-giga-64', realObserver64, modelSpec, judgeModel, thinkingLevel, [
    observerRequiresAll('/home/syzom/.pi/agent/AGENTS.md'),
  ], options);
}

export async function observerRealGiga96(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, options?: OmEvalOptions): Promise<AgentEvalRecord> {
  return realObserverFixtureCase('observer-real-giga-96', realObserver96, modelSpec, judgeModel, thinkingLevel, [
    observerRequiresAll('memory-update.test.ts'),
    observerRequiresAll('status-command.test.ts'),
    observerRequiresAll('runs dropper from existing reflections'),
    observerRequiresAll('dropSoftActiveObservationsOver'),
    observerRequiresAll('dropWhenActiveObservationsOver'),
    observerRequiresAll('pnpm test'),
    observerRequiresAll('typecheck'),
  ], options);
}

export async function observerRealGiga64v2(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, options?: OmEvalOptions): Promise<AgentEvalRecord> {
  return realObserverFixtureCase('observer-real-giga-64-v2', realObserver64v2, modelSpec, judgeModel, thinkingLevel, [
    observerRequiresAll('normalizeAllowedIdsStrict'),
    observerRequiresAll('613 live observations', '178 live reflections'),
    observerRequiresAll('reflectorThinking'),
  ], options);
}

export async function observerZeroDurableRestraint(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel, options?: OmEvalOptions): Promise<AgentEvalRecord> {
  const started = Date.now();
  const chunk = [
    '[Source entry id: z1] [Assistant] I will inspect the files first.',
    '[Source entry id: z2] [Tool evidence: read] status: ok input: src/foo.ts output_omitted: true excerpt: [output omitted by observer policy]',
    '[Source entry id: z3] [Tool evidence: bash] status: ok input: pnpm test output_omitted: true excerpt: [output omitted by observer policy]',
    '[Source entry id: z4] [Assistant] Done.',
    '[Source entry id: z5] [User] thanks',
    '[Source entry id: z6] [Assistant] You are welcome.',
  ].join('\n');
  const ids = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6'];
  const { output, usage, agentDurationMs } = await runObserverCase(modelSpec, thinkingLevel, chunk, ids);
  const probe = {
    id: 'observer-zero-durable-restraint',
    question: 'Avoid recording observations when the chunk has no visible source payload beyond workflow/status noise, omitted tool output, and acknowledgements.',
    rubric: { pass_if: ['No observations recorded because the chunk contains no visible substantive source payload.'], fail_if: ['Records omitted tool output, workflow chatter, or acknowledgements as evidence.'] },
  };
  return gradeAgentOutput({ id: 'observer-zero-durable-restraint', agent: 'observer', output, probe, judgeModel, started, graders: [observerMaxCount(0)], usage: usage.total, agentDurationMs, diagnostics: { chunk }, noToolCallLabel: 'No record_observations tool call' });
}
