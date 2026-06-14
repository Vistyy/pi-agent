import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord } from '../types.js';
import { createUsageCollector, loadCuratorRunner, loadOmAgents, obs, ref, resolveModel } from '../runner.js';
import { curatorActionIdSummary, curatorEvalDiagnostics, curatorIds, forbiddenIds, judged, judgedCurator, missingIds, unexpectedIds } from '../diagnostics.js';

export async function observerHardCurrentStale(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-a] 2026-06-07 10:00 User: Earlier I said Redis for job state, but reject that now. Current rule: use SQLite at /tmp/jobs.db.',
    '[Source entry id: assistant-b] 2026-06-07 10:03 Assistant: Ran `npm run migrate -- --dry-run`; result was `Error: SQLITE_BUSY at src/db/migrate.ts:88`.',
    '[Source entry id: user-c] 2026-06-07 10:04 User: That SQLITE_BUSY is the blocker. Keep WAL enabled via `PRAGMA journal_mode=WAL`.',
    '[Source entry id: assistant-d] 2026-06-07 10:05 Assistant: Okay.',
  ].join('\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({
    ...auth,
    priorReflections: ['[rrrrrrrrrrrr] User requires exact current-vs-stale relationships.'],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-a', 'assistant-b', 'user-c', 'assistant-d'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judged('observer-current-stale-sqlite', 'observer', output ?? [], {
    id: 'observer-current-stale-sqlite',
    question: 'Did the observer extract the hard durable evidence from the chunk while omitting only the final assistant acknowledgement?',
    rubric: {
      pass_if: [
        'Output contains an observation preserving that Redis is rejected/stale and SQLite at /tmp/jobs.db is current.',
        'Output contains the exact command npm run migrate -- --dry-run from source assistant-b; this is substantive assistant/tool evidence, not acknowledgement noise.',
        'Output contains the exact error SQLITE_BUSY at src/db/migrate.ts:88.',
        'Output contains the WAL requirement PRAGMA journal_mode=WAL.',
        'Recorded observations cite only source ids present in the chunk.',
        'Output does not include source id assistant-d and does not preserve the final "Okay" acknowledgement as a standalone observation.',
      ],
      fail_if: [
        'Output treats Redis as current or omits that Redis is rejected/stale.',
        'Output omits /tmp/jobs.db or src/db/migrate.ts:88.',
        'Output invents source ids.',
        'Output includes source id assistant-d or a standalone observation for the final assistant acknowledgement.',
      ],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
}

export async function observerHardAssistantOnly(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: assistant-a] 2026-06-07 11:00 Assistant: I changed the parser entrypoint from src/parser.ts to src/parser/index.ts.',
    '[Source entry id: tool-b] 2026-06-07 11:01 Tool result: npm test failed: FAIL tests/parser-regression.test.ts > keeps CRLF offsets. Expected column 17, received column 16.',
    '[Source entry id: user-c] 2026-06-07 11:02 User: Do not call that fixed. The CRLF offset failure is still unresolved.',
  ].join('\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({ ...auth, priorReflections: [], priorObservations: [], chunk, allowedSourceEntryIds: ['assistant-a', 'tool-b', 'user-c'], thinkingLevel, maxTurns: 6, onUsage: usage.onUsage });
  const agentDurationMs = Date.now() - agentStarted;
  return judged('observer-assistant-tool-evidence', 'observer', output ?? [], {
    id: 'observer-assistant-tool-evidence',
    question: 'Did the observer preserve assistant/tool-result evidence plus the user-stated unresolved status?',
    rubric: {
      pass_if: [
        'Output preserves assistant-authored evidence that the parser entrypoint changed from src/parser.ts to src/parser/index.ts.',
        'Output preserves tool-result evidence for the exact failing test tests/parser-regression.test.ts > keeps CRLF offsets.',
        'Output preserves expected column 17 and received column 16.',
        'Output preserves user-c evidence that the CRLF offset failure remains unresolved/not fixed.',
      ],
      fail_if: ['Output ignores assistant/tool result evidence because it was not user-authored.', 'Output says or implies the CRLF offset issue is fixed.', 'Output invents source ids.'],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
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
  return judged('observer-hard-schema-mess', 'observer', output ?? [], {
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
  }, judgeModel, started, usage.total, agentDurationMs);
}


export async function observerHardDenseToolChunk(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-tool-a] [User @ 2026-06-11 20:00]: Current route: src/app/api/[org]/route.ts for org-scoped endpoints.',
    '[Source entry id: tool-tool-b]\n[Tool evidence: bash @ 2026-06-11 20:01]\nstatus: error\noutput_chars: 420\ninput: pnpm test tests/api-org.test.ts\nexitCode: 1\noutput_omitted: false\nexcerpt:\nFAIL tests/api-org.test.ts > org-scoped > missing header\nExpected 401\nReceived 200',
    '[Source entry id: assistant-tool-c] [Assistant @ 2026-06-11 20:02]: The missing-header test needs a middleware fix before the org API route can be called done.',
    '[Source entry id: tool-tool-d]\n[Tool evidence: read @ 2026-06-11 20:03]\nstatus: ok\noutput_chars: 18234\ninput: src/app/api/[org]/route.ts\noutput_omitted: true (truncated_to_300_chars)\nexcerpt:\nimport { Auth } from "./auth"\n… [truncated middle 17934 chars]\nexport default function handler() {}',
    '[Source entry id: user-tool-e] [User @ 2026-06-11 20:04]: Use JWT not session. Add org-id claim. Keep the test blocked until the header is served.',
  ].join('\n\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({
    ...auth,
    priorReflections: [],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-tool-a', 'tool-tool-b', 'assistant-tool-c', 'tool-tool-d', 'user-tool-e'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judged('observer-hard-dense-tool-chunk', 'observer', output ?? [], {
    id: 'observer-hard-dense-tool-chunk',
    question: 'Did the observer preserve durable facts from sanitized tool input while ignoring tool metadata/file-dump noise?',
    rubric: {
      pass_if: [
        'Output preserves the current route src/app/api/[org]/route.ts for org-scoped endpoints.',
        'Output preserves the exact failing test tests/api-org.test.ts and missing-header failure with Expected 401 and Received 200.',
        'Output preserves the middleware/header blocker relationship.',
        'Output preserves the user decision to use JWT not session and add org-id claim.',
        'Output cites only valid source ids and uses tool-tool-b only for the failing test/error, not for generic command activity.',
        'Output does not record read success, output_chars, truncation markers, or file import/export snippets as durable facts.',
        'Output is compressed: no more than 5 observations.',
      ],
      fail_if: [
        'Output omits the exact failing test or Expected/Received values.',
        'Output records tool metadata such as read succeeded, output_chars, or output_omitted as durable memory.',
        'Output treats the truncated read excerpt as a durable implementation fact unrelated to the user decisions/error.',
        'Output invents source ids or records more than 5 observations.',
      ],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
}

export async function observerHardEditForkChurn(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-churn-a] [User @ 2026-06-11 21:00]: Revert the config key to `emergencyCurateWhenVisibleObservationsOver`; do not keep the older `dropWhenActiveObservationsOver` soft-trigger wording.',
    '[Source entry id: tool-churn-b]\n[Tool evidence: edit @ 2026-06-11 21:01]\nstatus: ok\noutput_chars: 78\ninput: src/config.ts\noutput_omitted: false\nexcerpt:\nSuccessfully replaced 1 block in src/config.ts.',
    '[Source entry id: tool-churn-c]\n[Tool evidence: edit @ 2026-06-11 21:02]\nstatus: ok\noutput_chars: 84\ninput: tests/config.test.ts\noutput_omitted: false\nexcerpt:\nSuccessfully replaced 1 block in tests/config.test.ts.',
    '[Source entry id: tool-churn-d]\n[Tool evidence: fork @ 2026-06-11 21:03]\nstatus: ok\noutput_chars: 4281\noutput_omitted: true (truncated_to_300_chars)\nexcerpt:\n## Result\nRecommended: use emergencyCurateWhenVisibleObservationsOver.\n… [truncated middle 3981 chars]\nEnd.',
    '[Source entry id: tool-churn-e]\n[Tool evidence: write @ 2026-06-11 21:04]\nstatus: ok\noutput_chars: 42\ninput: docs/README.md\noutput_omitted: false\nexcerpt:\nSuccessfully wrote 2341 bytes.',
    '[Source entry id: assistant-churn-f] [Assistant @ 2026-06-11 21:05]: Reverted the config key and updated tests/docs to match.',
  ].join('\n\n');
  const { runObserver } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runObserver({
    ...auth,
    priorReflections: ['[rrrrrrrrrrrr] Curator emergency pressure uses visible observations, not old dropper soft thresholds.'],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-churn-a', 'tool-churn-b', 'tool-churn-c', 'tool-churn-d', 'tool-churn-e', 'assistant-churn-f'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judged('observer-hard-edit-fork-churn', 'observer', output ?? [], {
    id: 'observer-hard-edit-fork-churn',
    question: 'Did the observer compress edit/write/fork churn into durable config state without recording tool operations?',
    rubric: {
      pass_if: [
        'Output preserves the current config key emergencyCurateWhenVisibleObservationsOver.',
        'Output preserves that older dropWhenActiveObservationsOver soft-trigger wording should not remain current.',
        'Output does not record individual edit/write/fork operations as durable observations.',
        'Output does not preserve Successfully replaced/wrote messages as memory facts.',
        'Output is compressed: at most 2 observations.',
      ],
      fail_if: [
        'Output omits emergencyCurateWhenVisibleObservationsOver.',
        'Output records edit/write/fork tool activity as standalone durable facts.',
        'Output treats dropWhenActiveObservationsOver soft-trigger wording as current.',
        'Output invents source ids or records more than 2 observations.',
      ],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
}

export async function observerHardOmittedToolEvidence(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: user-budget-a] [User @ 2026-06-11 22:00]: If validation fails, keep the exact failing file. Otherwise do not infer failure from tool metadata.',
    '[Source entry id: tool-budget-b]\n[Tool evidence: bash @ 2026-06-11 22:01]\nstatus: ok\noutput_chars: 1200\ninput: pnpm test tests/parser.test.ts\nexitCode: 0\noutput_omitted: true (truncated_to_80_chars)\nexcerpt:\nPASS tests/parser.test.ts\n… [truncated middle 1120 chars]\nDone.',
    '[Source entry id: tool-budget-c]\n[Tool evidence: bash @ 2026-06-11 22:02]\nstatus: error\noutput_chars: 2400\ninput: pnpm test tests/auth-refresh.test.ts\nexitCode: 1\noutput_omitted: true (budget_exhausted)\nexcerpt:\n[output omitted: observer tool excerpt budget exhausted]',
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
    allowedSourceEntryIds: ['user-budget-a', 'tool-budget-b', 'tool-budget-c', 'assistant-budget-d'],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judged('observer-hard-omitted-tool-evidence', 'observer', output ?? [], {
    id: 'observer-hard-omitted-tool-evidence',
    question: 'Did the observer avoid inventing omitted tool evidence while preserving visible validation facts?',
    rubric: {
      pass_if: [
        'Output may preserve that tests/parser.test.ts passed if it records validation evidence.',
        'Output does not claim the exact auth-refresh failure because the error output was omitted due to budget exhaustion.',
        'Output may preserve that auth-refresh needs rerun/larger excerpt before claiming exact failure, sourced to assistant-budget-d.',
        'Output does not treat budget_exhausted or output omitted markers as durable facts themselves.',
        'Output cites only valid source ids.',
      ],
      fail_if: [
        'Output invents a specific auth-refresh error not present in the chunk.',
        'Output records budget_exhausted/output omitted as a memory fact.',
        'Output says auth-refresh passed.',
        'Output invents source ids.',
      ],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
}
