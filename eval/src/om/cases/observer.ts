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

