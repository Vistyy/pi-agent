import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord } from '../types.js';
import { createUsageCollector, loadCuratorRunner, loadOmAgents, obs, ref, resolveModel } from '../runner.js';
import { runPiSdk } from '../../lib/pi.js';
import { judgedObserverScored, observerForbidsAny, observerForbidsSourceIds, observerMaxCount, observerRequiresAll, observerText } from '../diagnostics.js';

async function loadObserverSystemPrompt(): Promise<string> {
  const base = new URL('../../../../extensions/pi-observational-memory/src/agents/observer/prompts.ts', import.meta.url);
  const prompts = await import(base.href) as { OBSERVER_SYSTEM: string };
  return prompts.OBSERVER_SYSTEM;
}

function observerChurnDiagnosticPrompt(chunk: string, output: unknown, observerSystem: string): string {
  return `We are debugging observer observation-recording behavior in an eval. This is not an accusation; treat it as an investigation into what instruction or context shaped your choice.

Original observer chunk:
${chunk}

Recorded observations:
${JSON.stringify(output, null, 2)}

Mismatch:
You recorded observations about file updates (src/config.ts, tests/config.test.ts, docs/README.md) as durable facts. The intended behavior is to preserve compact project/user outcomes, not process activity.

Observer rules you were given:
${observerSystem}

Please analyze the decision. Why did these file-update breadcrumbs feel like durable evidence? Was a rule unclear, too weak, or contradicted by another rule? Was the input structure (explicit source entry ids, timestamps, successful edit/write text, assistant summary) pushing toward recording them?

Answer as a concise debugging report, not as an apology.`;
}

async function diagnoseObserverChurn(modelSpec: string, chunk: string, output: unknown) {
  const text = observerText(output as any);
  if (!text.includes('src/config.ts') && !text.includes('tests/config.test.ts') && !text.includes('docs/README.md')) return undefined;
  const observerSystem = await loadObserverSystemPrompt();
  const prompt = observerChurnDiagnosticPrompt(chunk, output, observerSystem);
  const run = await runPiSdk(prompt, { model: modelSpec, systemPrompt: 'Concise diagnostic analyst. Explain causes, not apologies.', thinkingLevel: 'low', maxAgentTurns: 1 });
  return { prompt, answer: run.stdout, usage: run.usage, durationMs: run.durationMs };
}

export async function observerHardStateStaleBlocker(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-a] 2026-06-07 10:00 User: Earlier I said Redis for job state, but reject that now. Current rule: use SQLite at /tmp/jobs.db.',
    '[Source entry id: assistant-b] 2026-06-07 10:03 Assistant: Ran `npm run migrate -- --dry-run`; result was `Error: SQLITE_BUSY at src/db/migrate.ts:88`.',
    '[Source entry id: user-c] 2026-06-07 10:04 User: That SQLITE_BUSY is the blocker. Keep WAL enabled via `PRAGMA journal_mode=WAL`.',
    '[Source entry id: assistant-d] 2026-06-07 10:05 Assistant: I changed the parser entrypoint from src/parser.ts to src/parser/index.ts.',
    '[Source entry id: tool-e] 2026-06-07 10:06 Tool result: npm test failed: FAIL tests/parser-regression.test.ts > keeps CRLF offsets. Expected column 17, received column 16.',
    '[Source entry id: user-f] 2026-06-07 10:07 User: Do not call that fixed. The CRLF offset failure is still unresolved.',
    '[Source entry id: assistant-g] 2026-06-07 10:08 Assistant: Okay.',
  ].join('\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({
    ...auth,
    priorReflections: ['[rrrrrrrrrrrr] User requires exact current-vs-stale relationships.'],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-a', 'assistant-b', 'user-c', 'assistant-d', 'tool-e', 'user-f', 'assistant-g'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedObserverScored('observer-hard-state-stale-blocker', output, {
    id: 'observer-hard-state-stale-blocker',
    question: 'Did the observer preserve current-vs-stale state, assistant/tool evidence, exact blockers, and unresolved status without acknowledgement noise?',
    rubric: {
      pass_if: [
        'Output preserves Redis as rejected/stale and SQLite at /tmp/jobs.db as current.',
        'Output preserves npm run migrate -- --dry-run, SQLITE_BUSY at src/db/migrate.ts:88, and PRAGMA journal_mode=WAL.',
        'Output preserves assistant-authored parser entrypoint change from src/parser.ts to src/parser/index.ts.',
        'Output preserves tests/parser-regression.test.ts CRLF offset failure with expected column 17 and received column 16, and marks it unresolved/not fixed.',
        'Output excludes final acknowledgement noise.',
      ],
      fail_if: [
        'Output treats Redis as current or CRLF offsets as fixed.',
        'Output omits any exact blocker path, command, test name, or expected/received values.',
        'Output ignores assistant/tool evidence because it was not user-authored.',
        'Output includes source id assistant-g or a standalone acknowledgement observation.',
      ],
    },
  }, judgeModel, started, [
    observerForbidsSourceIds('assistant-g'),
  ], [
    observerRequiresAll('SQLite', '/tmp/jobs.db'),
    observerRequiresAll('SQLITE_BUSY', 'src/db/migrate.ts:88'),
    observerRequiresAll('PRAGMA journal_mode=WAL'),
    observerRequiresAll('src/parser.ts', 'src/parser/index.ts'),
    observerRequiresAll('tests/parser-regression.test.ts', '17', '16'),
    observerMaxCount(5),
  ], usage.total, agentDurationMs);
}

export async function observerHardSchemaMess(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-schema-a] User: For the durable ledger we agreed on the custom event `om.observations.flagged`. It has `observationIds` and a bounded one-line `reason`; do not turn this into a generic follow-up marker.',
    '[Source entry id: assistant-schema-b] Assistant: I will update docs to say flagged observations request corrective/additional reflections, not mutation of old reflections.',
    '[Source entry id: user-schema-c] User: Also keep the future reflection lifecycle names exact: `om.reflections.deprecated` and `om.reflections.superseded`. They are proposed future events, not implemented yet.',
    '[Source entry id: tool-schema-d] Tool result: grep also shows stale older notes mentioning dropper soft threshold, additive mode, and reflectorThinking xhigh; those are not the current schema names.',
    '[Source entry id: user-schema-e] User: The important part is not just "there are flags". The exact API/event names are the memory: om.observations.flagged, reason, om.reflections.deprecated, om.reflections.superseded.',
    '[Source entry id: assistant-schema-f] Assistant: Okay, noted.'
  ].join('\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({
    ...auth,
    priorReflections: ['[rrrrrrrrrrrr] Memory lifecycle has curator follow-up flags and future reflection deprecation/supersession work.'],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-schema-a', 'assistant-schema-b', 'user-schema-c', 'tool-schema-d', 'user-schema-e', 'assistant-schema-f'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedObserverScored('observer-hard-schema-mess', output, {
    id: 'observer-hard-schema-mess',
    question: 'Did the observer preserve exact durable schema/API/event names from a messy source chunk while avoiding stale cleanup distractions?',
    rubric: {
      pass_if: [
        'Output preserves the exact event name om.observations.flagged.',
        'Output preserves that om.observations.flagged has observationIds and a bounded one-line reason field.',
        'Output preserves exact future event names om.reflections.deprecated and om.reflections.superseded and marks them as proposed/future, not implemented current behavior.',
        'Output does not elevate stale cleanup details like additive mode, dropper soft threshold, or reflectorThinking xhigh as the main current schema facts.',
        'Output cites only valid source ids and excludes assistant-schema-f acknowledgement noise.'
      ],
      fail_if: [
        'Output paraphrases the schema as generic flags without exact event names.',
        'Output omits reason or either reflection lifecycle event name.',
        'Output treats deprecated/superseded reflection events as already implemented current behavior.',
        'Output invents source ids or records the final acknowledgement as a durable observation.'
      ],
    },
  }, judgeModel, started, [
    observerForbidsSourceIds('assistant-schema-f'),
  ], [
    observerRequiresAll('om.observations.flagged'),
    observerRequiresAll('observationIds', 'reason'),
    observerRequiresAll('om.reflections.deprecated', 'om.reflections.superseded'),
    { label: 'marks stale schema terms as not current', pass: (output) => observerText(output).includes('stale') && (observerText(output).includes('not current') || observerText(output).includes('not the current')), detail: (output) => observerText(output) },
  ], usage.total, agentDurationMs);
}


export async function observerHardToolEvidenceBoundary(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-tool-a] [User @ 2026-06-11 20:00]: Current route: src/app/api/[org]/route.ts for org-scoped endpoints.',
    '[Source entry id: tool-tool-b]\n[Tool evidence: bash @ 2026-06-11 20:01]\nstatus: error\noutput_chars: 420\ninput: pnpm test tests/api-org.test.ts\nexitCode: 1\noutput_omitted: false\nexcerpt:\nFAIL tests/api-org.test.ts > org-scoped > missing header\nExpected 401\nReceived 200',
    '[Source entry id: assistant-tool-c] [Assistant @ 2026-06-11 20:02]: The missing-header test needs a middleware fix before the org API route can be called done.',
    '[Source entry id: tool-tool-d]\n[Tool evidence: read @ 2026-06-11 20:03]\nstatus: ok\noutput_chars: 18234\ninput: src/app/api/[org]/route.ts\noutput_omitted: true (policy)\nexcerpt:\n[output omitted by observer policy]',
    '[Source entry id: user-tool-e] [User @ 2026-06-11 20:04]: Use JWT not session. Add org-id claim. Keep the test blocked until the header is served.',
    '[Source entry id: user-success-a] [User @ 2026-06-11 23:00]: The db helper module is exported as `createDbClient` from src/db/client.ts and takes options `{ url, maxRetries, logQueries }`. For this handoff, remember what validation proves about its defaults.',
    '[Source entry id: tool-success-b]\n[Tool evidence: bash @ 2026-06-11 23:01]\nstatus: ok\noutput_chars: 240\ninput: pnpm test tests/db-client.test.ts\nexitCode: 0\noutput_omitted: false\nexcerpt:\nPASS tests/db-client.test.ts > createDbClient defaults maxRetries to 3\nPASS tests/db-client.test.ts > createDbClient disables logQueries by default',
    '[Source entry id: user-budget-a] [User @ 2026-06-11 22:00]: If validation fails, keep the exact failing file. Otherwise do not infer failure from tool metadata.',
    '[Source entry id: tool-budget-b]\n[Tool evidence: bash @ 2026-06-11 22:01]\nstatus: ok\noutput_chars: 1200\ninput: pnpm test tests/parser.test.ts\nexitCode: 0\noutput_omitted: true (length)\nexcerpt:\nPASS tests/parser.test.ts\nPASS tests/parser-regression.test.ts\n… [truncated middle 24 lines]\nDone.',
    '[Source entry id: tool-budget-c]\n[Tool evidence: bash @ 2026-06-11 22:02]\nstatus: error\noutput_chars: 2400\ninput: pnpm test tests/auth-refresh.test.ts\nexitCode: 1\noutput_omitted: true (length)\nexcerpt:\n[output omitted because observer input budget was exhausted]',
    '[Source entry id: assistant-budget-d] [Assistant @ 2026-06-11 22:03]: I need to rerun auth with a larger excerpt before claiming the exact failure.',
  ].join('\n\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({
    ...auth,
    priorReflections: [],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-tool-a', 'tool-tool-b', 'assistant-tool-c', 'tool-tool-d', 'user-tool-e', 'user-success-a', 'tool-success-b', 'user-budget-a', 'tool-budget-b', 'tool-budget-c', 'assistant-budget-d'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedObserverScored('observer-hard-tool-evidence-boundary', output, {
    id: 'observer-hard-tool-evidence-boundary',
    question: 'Did the observer preserve actionable tool evidence while ignoring raw read snippets and omitted evidence?',
    rubric: {
      pass_if: [
        'Output preserves org route, failing api-org test with 401/200, middleware/header blocker, JWT decision, and org-id claim.',
        'Output preserves createDbClient API details and the explicitly requested validation result: tests/db-client.test.ts proves maxRetries defaults to 3 and logQueries is disabled by default.',
        'Output may preserve parser test pass and auth-refresh rerun/larger excerpt need, but must not invent the omitted auth-refresh failure.',
        'Output does not record read success, output metadata, or file import/export snippets as durable facts.',
      ],
      fail_if: [
        'Output omits required failing or passing test evidence.',
        'Output records raw read excerpt implementation details such as Auth import/createOrgRoute/export default handler.',
        'Output invents a specific auth-refresh failure not visible in the chunk or records output omitted markers as memory.',
      ],
    },
  }, judgeModel, started, [
    observerForbidsAny('imports `Auth`', 'import { Auth', 'createOrgRoute', 'export default function handler', 'output_chars', 'output_omitted', 'output omitted by observer policy'),
  ], [
    observerRequiresAll('tests/api-org.test.ts'),
    observerRequiresAll('401', '200'),
    observerRequiresAll('JWT', 'org-id'),
    observerRequiresAll('createDbClient', 'src/db/client.ts'),
    observerRequiresAll('url', 'maxRetries', 'logQueries'),
    observerRequiresAll('maxRetries', '3', 'logQueries'),
    observerRequiresAll('tests/db-client.test.ts'),
    observerMaxCount(8),
  ], usage.total, agentDurationMs);
}

export async function observerHardStateVsProvenance(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-state-a] [User @ 2026-06-11 21:00]: Revert the config key to `emergencyCurateWhenVisibleObservationsOver`; do not keep the older `dropWhenActiveObservationsOver` soft-trigger wording.',
    '[Source entry id: tool-state-b]\n[Tool evidence: edit @ 2026-06-11 21:01]\nstatus: ok\noutput_chars: 78\ninput: src/config.ts\noutput_omitted: true (policy)\nexcerpt:\n[output omitted by observer policy]',
    '[Source entry id: tool-state-c]\n[Tool evidence: edit @ 2026-06-11 21:02]\nstatus: ok\noutput_chars: 84\ninput: tests/config.test.ts\noutput_omitted: true (policy)\nexcerpt:\n[output omitted by observer policy]',
    '[Source entry id: tool-state-d]\n[Tool evidence: write @ 2026-06-11 21:04]\nstatus: ok\noutput_chars: 42\ninput: docs/README.md\noutput_omitted: true (policy)\nexcerpt:\n[output omitted by observer policy]',
    '[Source entry id: assistant-state-e] [Assistant @ 2026-06-11 21:05]: Reverted the config key and updated tests/docs to match.',
    '[Source entry id: user-prov-a] [User @ 2026-06-12 08:00]: For the migration handoff, remember the exact files touched and anything still missing.',
    '[Source entry id: tool-prov-b]\n[Tool evidence: edit @ 2026-06-12 08:01]\nstatus: ok\noutput_chars: 61\ninput: src/db/migrate.ts\noutput_omitted: true (policy)\nexcerpt:\n[output omitted by observer policy]',
    '[Source entry id: tool-prov-c]\n[Tool evidence: edit @ 2026-06-12 08:02]\nstatus: ok\noutput_chars: 72\ninput: tests/db-migrate.test.ts\noutput_omitted: true (policy)\nexcerpt:\n[output omitted by observer policy]',
    '[Source entry id: assistant-prov-d] [Assistant @ 2026-06-12 08:03]: Migration handoff touched src/db/migrate.ts and tests/db-migrate.test.ts; docs/migrations.md is still TODO.',
  ].join('\n\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({
    ...auth,
    priorReflections: ['[rrrrrrrrrrrr] Curator emergency pressure uses visible observations, not old dropper soft thresholds.'],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-state-a', 'tool-state-b', 'tool-state-c', 'tool-state-d', 'assistant-state-e', 'user-prov-a', 'tool-prov-b', 'tool-prov-c', 'assistant-prov-d'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  const diagnostics = await diagnoseObserverChurn(modelSpec, chunk, output ?? []);
  return judgedObserverScored('observer-hard-state-vs-provenance', output, {
    id: 'observer-hard-state-vs-provenance',
    question: 'Did the observer distinguish ordinary workflow breadcrumbs from explicitly future-relevant provenance?',
    rubric: {
      pass_if: [
        'Output preserves emergencyCurateWhenVisibleObservationsOver as current and dropWhenActiveObservationsOver as stale/rejected.',
        'Output does not preserve ordinary state-change file-update breadcrumbs for src/config.ts, tests/config.test.ts, or docs/README.md.',
        'Output preserves explicit migration handoff provenance: src/db/migrate.ts and tests/db-migrate.test.ts were touched and docs/migrations.md is TODO.',
      ],
      fail_if: [
        'Output records ordinary config/test/docs update breadcrumbs as memory.',
        'Output omits explicit migration handoff touched files or docs TODO.',
        'Output invents missing work from absent tool output.',
      ],
    },
  }, judgeModel, started, [
    observerForbidsAny('tests/config.test.ts', 'docs/README.md', 'Successfully replaced', 'Successfully wrote', 'were updated', 'was updated', 'were edited', 'was written', 'output omitted by observer policy'),
  ], [
    observerRequiresAll('emergencyCurateWhenVisibleObservationsOver', 'dropWhenActiveObservationsOver'),
    observerRequiresAll('src/db/migrate.ts', 'tests/db-migrate.test.ts'),
    observerRequiresAll('docs/migrations.md', 'TODO'),
    observerMaxCount(4),
  ], usage.total, agentDurationMs, diagnostics);
}

export async function observerHardFutureIntent(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-future-a] [User @ 2026-06-12 09:00]: For OM, next we should finish the observer provenance policy, then add deterministic checks for observer evals. After that, maybe revisit docs cleanup if the evals still look noisy.',
    '[Source entry id: assistant-future-b] [Assistant @ 2026-06-12 09:01]: Agreed. I will handle policy first, deterministic checks second, and leave docs cleanup tentative/later.',
  ].join('\n\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({
    ...auth,
    priorReflections: [],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-future-a', 'assistant-future-b'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedObserverScored('observer-hard-future-intent', output, {
    id: 'observer-hard-future-intent',
    question: 'Did the observer preserve explicit future work, sequencing, and uncertainty?',
    rubric: {
      pass_if: [
        'Output preserves observer provenance policy as the next/first work.',
        'Output preserves deterministic observer eval checks as later/second work.',
        'Output preserves docs cleanup as tentative/maybe/later and conditional on noisy evals.',
        'Output does not turn tentative docs cleanup into approved immediate work.',
      ],
      fail_if: [
        'Output omits the sequence between provenance policy and deterministic checks.',
        'Output omits uncertainty/conditional status for docs cleanup.',
        'Output invents completed implementation work.',
      ],
    },
  }, judgeModel, started, [], [
    observerRequiresAll('observer provenance policy'),
    observerRequiresAll('deterministic'),
    observerRequiresAll('docs cleanup'),
    observerMaxCount(3),
  ], usage.total, agentDurationMs);
}


export async function observerHardSessionCorrectionNoise(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-session-a] [User @ 2026-06-12 10:00]: Earlier I said Redis for all queue state. Reject that. Current split: SQLite at /tmp/jobs.db for job state, Redis only for distributed locks.',
    '[Source entry id: tool-session-b]\n[Tool evidence: edit @ 2026-06-12 10:01]\nstatus: ok\noutput_chars: 64\ninput: src/queue/config.ts\noutput_omitted: true (policy)\nexcerpt:\n[output omitted by observer policy]',
    '[Source entry id: assistant-session-c] [Assistant @ 2026-06-12 10:02]: Updated queue config and tests to match the split.',
    '[Source entry id: user-session-d] [User @ 2026-06-12 10:03]: Also new requirement: enable WAL with `PRAGMA journal_mode=WAL` before migrations. Keep the previous /tmp/jobs.db path, do not restate it unless needed.',
    '[Source entry id: tool-session-e]\n[Tool evidence: bash @ 2026-06-12 10:04]\nstatus: error\noutput_chars: 180\ninput: pnpm test tests/queue-migrate.test.ts\nexitCode: 1\noutput_omitted: false\nexcerpt:\nFAIL tests/queue-migrate.test.ts > queue migrate > busy database\nError: SQLITE_BUSY at src/db/migrate.ts:88',
    '[Source entry id: user-session-f] [User @ 2026-06-12 10:05]: That SQLITE_BUSY is unresolved. Do not call migration fixed.',
    '[Source entry id: assistant-session-g] [Assistant @ 2026-06-12 10:06]: Okay.',
  ].join('\n\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({
    ...auth,
    priorReflections: ['[rrrrrrrrrrrr] Queue state previously used Redis for all state, but this may be stale.'],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-session-a', 'tool-session-b', 'assistant-session-c', 'user-session-d', 'tool-session-e', 'user-session-f', 'assistant-session-g'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedObserverScored('observer-hard-session-correction-noise', output, {
    id: 'observer-hard-session-correction-noise',
    question: 'Did the observer preserve durable queue/migration state while ignoring edit/ack workflow noise?',
    rubric: {
      pass_if: [
        'Output preserves latest split: SQLite /tmp/jobs.db for job state and Redis only for distributed locks.',
        'Output preserves WAL requirement and unresolved SQLITE_BUSY at src/db/migrate.ts:88 from tests/queue-migrate.test.ts.',
        'Output does not record edit/test-update workflow breadcrumbs or final acknowledgement noise.',
      ],
      fail_if: [
        'Output treats Redis-for-all-state as current.',
        'Output says migration is fixed.',
        'Output records successful edit/update workflow as memory.',
      ],
    },
  }, judgeModel, started, [
    observerForbidsSourceIds('assistant-session-g'),
    observerForbidsAny('Updated queue config', 'tests to match', 'output omitted by observer policy', 'migration fixed'),
  ], [
    observerRequiresAll('SQLite', '/tmp/jobs.db'),
    observerRequiresAll('job state'),
    observerRequiresAll('Redis', 'distributed locks'),
    observerRequiresAll('PRAGMA journal_mode=WAL'),
    observerRequiresAll('tests/queue-migrate.test.ts', 'SQLITE_BUSY', 'src/db/migrate.ts:88'),
    observerMaxCount(5),
  ], usage.total, agentDurationMs);
}

export async function observerHardSessionIntentProvenance(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-intent-a] [User @ 2026-06-12 13:00]: For the sidecar, use Go. API must be REST over HTTP, not gRPC. No framework for v1; stdlib only unless I approve chi/gin later.',
    '[Source entry id: user-intent-b] [User @ 2026-06-12 13:03]: For the migration handoff, remember exact touched files and missing docs.',
    '[Source entry id: tool-intent-c]\n[Tool evidence: edit @ 2026-06-12 13:04]\nstatus: ok\noutput_chars: 61\ninput: src/db/migrate.ts\noutput_omitted: true (policy)\nexcerpt:\n[output omitted by observer policy]',
    '[Source entry id: tool-intent-d]\n[Tool evidence: edit @ 2026-06-12 13:05]\nstatus: ok\noutput_chars: 72\ninput: tests/db-migrate.test.ts\noutput_omitted: true (policy)\nexcerpt:\n[output omitted by observer policy]',
    '[Source entry id: assistant-intent-e] [Assistant @ 2026-06-12 13:06]: Migration handoff touched src/db/migrate.ts and tests/db-migrate.test.ts; docs/migrations.md is still TODO.',
    '[Source entry id: user-intent-f] [User @ 2026-06-12 13:07]: no, cache path is /tmp/om-cache, not ~/.cache/om.',
    '[Source entry id: assistant-intent-g] [Assistant @ 2026-06-12 13:08]: Sounds good.',
  ].join('\n\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({
    ...auth,
    priorReflections: ['[rrrrrrrrrrrr] Cache path was previously assumed to be ~/.cache/om.'],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-intent-a', 'user-intent-b', 'tool-intent-c', 'tool-intent-d', 'assistant-intent-e', 'user-intent-f', 'assistant-intent-g'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedObserverScored('observer-hard-session-intent-provenance', output, {
    id: 'observer-hard-session-intent-provenance',
    question: 'Did the observer preserve mixed constraints, explicit provenance, and terse correction without workflow noise?',
    rubric: {
      pass_if: [
        'Output preserves Go/REST/no-framework sidecar constraints.',
        'Output preserves explicit migration handoff files and docs TODO.',
        'Output preserves /tmp/om-cache as current and ~/.cache/om as stale/rejected.',
      ],
      fail_if: [
        'Output omits any independent sidecar constraint.',
        'Output records successful edit receipts instead of handoff provenance.',
        'Output discards terse cache correction.',
      ],
    },
  }, judgeModel, started, [
    observerForbidsSourceIds('assistant-intent-g'),
    observerForbidsAny('output omitted by observer policy', 'Successfully replaced'),
  ], [
    observerRequiresAll('Go'),
    observerRequiresAll('REST', 'HTTP', 'gRPC'),
    observerRequiresAll('stdlib'),
    observerRequiresAll('src/db/migrate.ts', 'tests/db-migrate.test.ts', 'docs/migrations.md', 'TODO'),
    observerRequiresAll('/tmp/om-cache', '~/.cache/om'),
    observerMaxCount(6),
  ], usage.total, agentDurationMs);
}
