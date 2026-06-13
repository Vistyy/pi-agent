import fs from 'node:fs';
import path from 'node:path';
import { AuthStorage, ModelRegistry } from '@earendil-works/pi-coding-agent';
import type { Model, ModelThinkingLevel } from '@earendil-works/pi-ai';
import { DEFAULT_MODEL } from './lib/pi.js';
import { runJudge } from './lib/judge.js';
import type { Probe, TokenUsage } from './lib/types.js';

type Observation = { id: string; content: string; timestamp: string; sourceEntryIds: string[]; tokenCount: number };
type Reflection = { id: string; content: string; supportingObservationIds: string[]; tokenCount: number };
type CuratorActionResult = {
  pinned: Array<{ observationIds: string[]; reason: string }>;
  unpinned: Array<{ observationIds: string[]; reason: string }>;
  flagged: Array<{ observationIds: string[]; reason: string }>;
  dropped: string[];
};

type OmAgents = {
  runObserver: (args: Record<string, unknown>) => Promise<Observation[] | undefined>;
  runReflector: (args: Record<string, unknown>) => Promise<Reflection[] | undefined>;
  runCurator: (args: Record<string, unknown>) => Promise<CuratorActionResult | undefined>;
  runCuratorPhased: (args: Record<string, unknown>) => Promise<CuratorActionResult | undefined>;
};

let omAgents: OmAgents | undefined;
let curatorMode: 'single' | 'phased' = 'single';

async function loadOmAgents(): Promise<OmAgents> {
  if (omAgents) return omAgents;
  const base = new URL('../../extensions/pi-observational-memory/src/agents/', import.meta.url);
  const observer = await import(new URL('observer/agent.ts', base).href) as { runObserver: OmAgents['runObserver'] };
  const reflector = await import(new URL('reflector/agent.ts', base).href) as { runReflector: OmAgents['runReflector'] };
  const curator = await import(new URL('curator/agent.ts', base).href) as { runCurator: OmAgents['runCurator']; runCuratorPhased: OmAgents['runCuratorPhased'] };
  omAgents = { runObserver: observer.runObserver, runReflector: reflector.runReflector, runCurator: curator.runCurator, runCuratorPhased: curator.runCuratorPhased };
  return omAgents;
}

type AgentEvalRecord = {
  id: string;
  agent: 'observer' | 'reflector' | 'curator';
  output: unknown;
  judge?: unknown;
  passed: boolean;
  durationMs: number;
  agentDurationMs?: number;
  judgeDurationMs?: number;
  usage?: TokenUsage;
  judgeUsage?: TokenUsage;
  diagnosis?: unknown;
  diagnosisUsage?: TokenUsage;
  diagnosisDurationMs?: number;
  error?: string;
};

type Args = { model: string; judgeModel: string; outDir: string; thinkingLevel: ModelThinkingLevel; only?: string; curatorMode: 'single' | 'phased' };

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (name: string, fallback?: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    model: get('--model', DEFAULT_MODEL)!,
    judgeModel: get('--judge-model', get('--model', DEFAULT_MODEL))!,
    outDir: get('--out', path.join('runs', `om-agent-evals-${Date.now()}`))!,
    thinkingLevel: (get('--thinking', 'xhigh') ?? 'xhigh') as ModelThinkingLevel,
    only: get('--only'),
    curatorMode: args.includes('--curator-phased') ? 'phased' : 'single',
  };
}

function parseModelSpec(spec: string): [provider: string, id: string] {
  const [provider, ...rest] = spec.split('/');
  const id = rest.join('/');
  if (!provider || !id) throw new Error(`model must be provider/id, got: ${spec}`);
  return [provider, id];
}

async function loadCuratorRunner(): Promise<OmAgents['runCurator']> {
  const agents = await loadOmAgents();
  return curatorMode === 'phased' ? agents.runCuratorPhased : agents.runCurator;
}

async function resolveModel(spec: string): Promise<{ model: Model<any>; apiKey: string; headers?: Record<string, string> }> {
  const authStorage = AuthStorage.create();
  const registry = ModelRegistry.create(authStorage);
  const [provider, id] = parseModelSpec(spec);
  const model = registry.find(provider, id);
  if (!model) throw new Error(`unknown model: ${spec}`);
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) throw new Error(auth.error);
  return { model, apiKey: auth.apiKey ?? '', headers: auth.headers };
}

function obs(id: string, content: string, timestamp: string, tokenCount = 20): Observation {
  return { id, content, timestamp, sourceEntryIds: [`src-${id}`], tokenCount };
}

function ref(id: string, content: string, supportingObservationIds: string[]): Reflection {
  return { id, content, supportingObservationIds, tokenCount: Math.ceil(content.length / 4) };
}

function addUsage(total: TokenUsage, usage: TokenUsage): void {
  total.input = (total.input ?? 0) + (usage.input ?? 0);
  total.output = (total.output ?? 0) + (usage.output ?? 0);
  total.cacheRead = (total.cacheRead ?? 0) + (usage.cacheRead ?? 0);
  total.cacheWrite = (total.cacheWrite ?? 0) + (usage.cacheWrite ?? 0);
  total.totalTokens = (total.totalTokens ?? 0) + (usage.totalTokens ?? 0);
}

function createUsageCollector(): { onUsage: (event: { usage?: unknown }) => void; total: TokenUsage } {
  const total: TokenUsage = {};
  return {
    total,
    onUsage: (event) => addUsage(total, (event.usage ?? {}) as TokenUsage),
  };
}

function sumUsage(records: AgentEvalRecord[], key: 'usage' | 'judgeUsage' | 'diagnosisUsage'): TokenUsage {
  const total: TokenUsage = {};
  for (const record of records) addUsage(total, record[key] ?? {});
  return total;
}

function sumDuration(records: AgentEvalRecord[], key: 'durationMs' | 'agentDurationMs' | 'judgeDurationMs' | 'diagnosisDurationMs'): number {
  return records.reduce((sum, record) => sum + (record[key] ?? 0), 0);
}

async function diagnoseFailure(record: AgentEvalRecord, probe: Probe, judgeModel: string): Promise<AgentEvalRecord> {
  if (record.passed) return record;
  const diagnosticProbe: Probe = {
    id: `${probe.id}-diagnostic`,
    question: 'Diagnose why the evaluated agent output failed this eval. Focus on prompt/input difficulty, missed evidence, confusing near-matches, and what change might improve behavior. Do not relitigate pass/fail.',
    rubric: {
      pass_if: ['Explains likely failure causes from the inputs, output, and expected behavior.'],
      fail_if: ['Only repeats the failure label without analysis.'],
    },
  };
  const diagnosticInput = JSON.stringify({ expected: probe, output: record.output, failure: record.judge }, null, 2);
  const diagnosticStarted = Date.now();
  const { run, judge } = await runJudge(diagnosticProbe, diagnosticInput, judgeModel);
  return { ...record, diagnosis: judge, diagnosisUsage: run.usage, diagnosisDurationMs: Date.now() - diagnosticStarted, durationMs: Date.now() - diagnosticStarted + record.durationMs };
}

async function judged(id: string, agent: AgentEvalRecord['agent'], output: unknown, probe: Probe, judgeModel: string, started: number, usage?: TokenUsage, agentDurationMs?: number): Promise<AgentEvalRecord> {
  const answer = JSON.stringify(output, null, 2);
  const judgeStarted = Date.now();
  const { run, judge } = await runJudge(probe, answer, judgeModel);
  const record = { id, agent, output, judge, passed: run.status === 0 && judge.passed, durationMs: Date.now() - started, agentDurationMs, judgeDurationMs: Date.now() - judgeStarted, usage, judgeUsage: run.usage };
  return diagnoseFailure(record, probe, judgeModel);
}

function curatorIds(output: CuratorActionResult | undefined, key: keyof CuratorActionResult): string[] {
  const value = output?.[key];
  if (!value) return [];
  if (key === 'dropped') return value as string[];
  return (value as Array<{ observationIds: string[] }>).flatMap((batch) => batch.observationIds);
}

function deterministicCuratorFailure(output: CuratorActionResult | undefined, checks: Array<{ label: string; pass: (output: CuratorActionResult | undefined) => boolean }>): string | undefined {
  const failed = checks.filter((check) => !check.pass(output)).map((check) => check.label);
  return failed.length ? failed.join('; ') : undefined;
}

function deterministicCuratorRecord(
  id: string,
  output: CuratorActionResult | undefined,
  started: number,
  checks: Array<{ label: string; pass: (output: CuratorActionResult | undefined) => boolean }>,
  usage?: TokenUsage,
  agentDurationMs?: number,
): AgentEvalRecord {
  const deterministicFailure = deterministicCuratorFailure(output, checks);
  return {
    id,
    agent: 'curator',
    output: output ?? {},
    judge: deterministicFailure
      ? { passed: false, reason: `Deterministic invariant failed: ${deterministicFailure}` }
      : { passed: true, reason: 'Deterministic invariants passed.' },
    passed: !deterministicFailure,
    durationMs: Date.now() - started,
    agentDurationMs,
    usage,
  };
}

async function judgedCurator(
  id: string,
  output: CuratorActionResult | undefined,
  probe: Probe,
  judgeModel: string,
  started: number,
  checks: Array<{ label: string; pass: (output: CuratorActionResult | undefined) => boolean }>,
  usage?: TokenUsage,
  agentDurationMs?: number,
): Promise<AgentEvalRecord> {
  const deterministic = deterministicCuratorRecord(id, output, started, checks, usage, agentDurationMs);
  if (!deterministic.passed) return diagnoseFailure(deterministic, probe, judgeModel);
  return judged(id, 'curator', output ?? {}, probe, judgeModel, started, usage, agentDurationMs);
}

async function observerHardCurrentStale(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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

async function observerHardAssistantOnly(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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

async function reflectorHardCompression(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Earlier proposal Redis for job state is rejected; current decision is SQLite at /tmp/jobs.db.', '2026-06-07T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Migration dry run command `npm run migrate -- --dry-run` failed with `Error: SQLITE_BUSY at src/db/migrate.ts:88`.', '2026-06-07T10:03:00.000Z'),
    obs('cccccccccccc', 'User says SQLITE_BUSY is the blocker and WAL must stay enabled via `PRAGMA journal_mode=WAL`.', '2026-06-07T10:04:00.000Z'),
    obs('dddddddddddd', 'Assistant acknowledged the instruction.', '2026-06-07T10:05:00.000Z'),
  ];
  const { runReflector } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runReflector({ ...auth, reflections: [], observations, thinkingLevel, maxTurns: 6, onUsage: usage.onUsage });
  const agentDurationMs = Date.now() - agentStarted;
  return judged('reflector-current-stale-blocker', 'reflector', output ?? [], {
    id: 'reflector-current-stale-blocker',
    question: 'Did the reflector create durable one-line reflections for current/stale decision and unresolved blocker, without reflecting acknowledgement noise?',
    rubric: {
      pass_if: [
        'Output contains a reflection preserving SQLite at /tmp/jobs.db as current and Redis as rejected/stale.',
        'Output contains a reflection preserving the unresolved SQLITE_BUSY blocker at src/db/migrate.ts:88 and WAL/PRAGMA journal_mode=WAL requirement.',
        'Each reflection has a supportingObservationIds array containing only these exact valid ids: aaaaaaaaaaaa, bbbbbbbbbbbb, cccccccccccc, dddddddddddd.',
        'Output does not create a durable reflection merely for assistant acknowledgement.',
      ],
      fail_if: ['Output omits current-vs-stale relationship.', 'Output omits exact error/file or WAL requirement.', 'Any supportingObservationIds value is not one of: aaaaaaaaaaaa, bbbbbbbbbbbb, cccccccccccc, dddddddddddd.'],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
}

async function reflectorSupersessionRelation(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Canonical approved feature flag is `fast_sync_v2_enabled`, which supersedes `enableFastSync`; near-match to reject is `enableFastSync`.', '2026-06-07T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Repeated red-herring records say `enableFastSync` is a similar stale value explicitly not current for the final task.', '2026-06-07T10:01:00.000Z'),
    obs('cccccccccccc', 'Final meta-note: answer approved feature flag from the canonical record and rejected near-match already recorded.', '2026-06-07T10:02:00.000Z'),
  ];
  const { runReflector } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runReflector({ ...auth, reflections: [], observations, thinkingLevel, maxTurns: 6, onUsage: usage.onUsage });
  const agentDurationMs = Date.now() - agentStarted;
  return judged('reflector-supersession-relation', 'reflector', output ?? [], {
    id: 'reflector-supersession-relation',
    question: 'Did the reflector preserve the durable replacement/supersession relation instead of compressing it into only current-vs-stale labels?',
    rubric: {
      pass_if: [
        'Output contains a reflection preserving fast_sync_v2_enabled as the approved/canonical/current feature flag.',
        'Output contains enableFastSync as the stale/rejected near-match.',
        'Output preserves that fast_sync_v2_enabled supersedes or replaces enableFastSync; merely saying fast_sync_v2_enabled is current and enableFastSync is stale is not enough.',
        'The reflection cites supporting observation id aaaaaaaaaaaa and may cite bbbbbbbbbbbb or cccccccccccc.',
      ],
      fail_if: [
        'Output omits the supersedes/replaces relationship between fast_sync_v2_enabled and enableFastSync.',
        'Output treats enableFastSync as current or ambiguous.',
        'Output invents support ids.',
      ],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
}

async function reflectorReviewedZero(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Assistant said okay.', '2026-06-07T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'User said thanks.', '2026-06-07T10:01:00.000Z'),
  ];
  const { runReflector } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runReflector({ ...auth, reflections: [ref('eeeeeeeeeeee', 'User prefers concise memory updates.', ['aaaaaaaaaaaa'])], observations, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage });
  const agentDurationMs = Date.now() - agentStarted;
  return judged('reflector-reviewed-zero-noise', 'reflector', output ?? [], {
    id: 'reflector-reviewed-zero-noise',
    question: 'Did the reflector correctly add no durable reflections for acknowledgement-only observations?',
    rubric: {
      pass_if: ['Output is empty or otherwise indicates no new durable reflection was recorded.'],
      fail_if: ['Output records a durable reflection for thanks/okay acknowledgement noise.'],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
}

async function curatorFlagsMissingExactDetail(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Migration dry run command `pnpm migrate -- --dry-run` failed with exact error `Error: SQLITE_BUSY at src/db/migrate.ts:88`.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'User says the SQLITE_BUSY failure remains the current blocker and WAL must stay enabled via `PRAGMA journal_mode=WAL`.', '2026-06-07T09:01:00.000Z'),
  ];
  const reflections = [ref('cccccccccccc', 'Migration dry run failed with a database lock; WAL should stay enabled.', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])];
  const runCurator = await loadCuratorRunner();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 1, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCurator('curator-flags-missing-exact-detail', output, {
    id: 'curator-flags-missing-exact-detail',
    question: 'Did the curator avoid dropping evidence and preserve or request follow-up for exact missing blocker details?',
    rubric: {
      pass_if: [
        'Output flags aaaaaaaaaaaa and/or bbbbbbbbbbbb for reflector follow-up, or pins aaaaaaaaaaaa/bbbbbbbbbbbb to preserve exact detail in context.',
        'The dropped array does not contain aaaaaaaaaaaa or bbbbbbbbbbbb.',
        'Reasons may paraphrase. They do not need to repeat src/db/migrate.ts:88 or PRAGMA journal_mode=WAL if the pinned/flagged observation id contains that exact evidence.',
        'Pinning aaaaaaaaaaaa with a reason about exact SQLITE_BUSY command/error/path and flagging bbbbbbbbbbbb with a reason about exact WAL pragma is a pass.',
      ],
      fail_if: ['The dropped array contains aaaaaaaaaaaa or bbbbbbbbbbbb.', 'Output takes no action despite reflection omitting src/db/migrate.ts:88 and PRAGMA journal_mode=WAL.', 'Output only unpins observations.', 'Output neither pins nor flags any observation containing the omitted exact blocker evidence.'],
    },
  }, judgeModel, started, [
    { label: 'must not drop exact blocker observations', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
    { label: 'must pin or flag at least one exact blocker observation', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
  ], usage.total, agentDurationMs);
}

async function curatorContradictoryReflection(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Tool still fails: `pnpm test` reports FAIL tests/auth.test.ts > refresh token expiry.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'User says do not mark auth fixed; refresh token expiry is still unresolved.', '2026-06-07T09:01:00.000Z'),
    obs('cccccccccccc', 'Assistant mistakenly summarized the auth issue as fixed without a passing run.', '2026-06-07T09:02:00.000Z'),
  ];
  const reflections = [ref('dddddddddddd', 'Auth refresh token expiry is fixed.', ['aaaaaaaaaaaa'])];
  const runCurator = await loadCuratorRunner();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 2, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCurator('curator-contradictory-reflection', output, {
    id: 'curator-contradictory-reflection',
    question: 'Did the curator detect contradiction between reflection and observations and preserve evidence for repair?',
    rubric: {
      pass_if: [
        'Output flags and/or pins aaaaaaaaaaaa or bbbbbbbbbbbb for follow-up/visibility.',
        'Output does not drop aaaaaaaaaaaa or bbbbbbbbbbbb.',
        'Output reason indicates unresolved/failing/contradiction/fixed-without-passing-run concern.',
      ],
      fail_if: ['Output drops failing or user unresolved evidence.', 'Output marks no actions despite reflection contradicting observations.', 'Output only drops cccccccccccc while ignoring the contradiction.'],
    },
  }, judgeModel, started, [
    { label: 'must not drop contradictory unresolved evidence', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
    { label: 'must pin or flag contradictory unresolved evidence', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
  ], usage.total, agentDurationMs);
}

async function observerHardSchemaMess(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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

async function reflectorHardRepairFlag(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Exact implemented event is `om.observations.flagged`; it stores observationIds plus a bounded one-line `reason` for reflector follow-up.', '2026-06-11T20:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Future reflection lifecycle names under discussion are `om.reflections.deprecated` and `om.reflections.superseded`; they are not implemented yet.', '2026-06-11T20:01:00.000Z'),
    obs('cccccccccccc', 'Stale cleanup notes mention dropper, additive mode, and xhigh reflector thinking; these should not override the current event names.', '2026-06-11T20:02:00.000Z'),
  ];
  const reflections = [ref('dddddddddddd', 'Observation follow-up flags exist and reflection lifecycle deprecation/supersession is planned.', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])];
  const { runReflector } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runReflector({
    ...auth,
    reflections,
    observations: [observations[0]],
    flaggedObservations: [{ observation: observations[0], reasons: ['Existing reflection omitted exact event name om.observations.flagged and its reason field shape.'] }],
    thinkingLevel,
    maxTurns: 6,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judged('reflector-hard-repair-flag', 'reflector', output ?? [], {
    id: 'reflector-hard-repair-flag',
    question: 'Did the reflector use a flagged follow-up to add a corrective exact-detail reflection instead of doing nothing or repeating the generic prior reflection?',
    rubric: {
      pass_if: [
        'Output adds a new reflection that names om.observations.flagged exactly.',
        'Output includes the reason field shape or bounded one-line reason requirement.',
        'Output cites supporting observation id aaaaaaaaaaaa.',
        'Output does not claim to modify/delete the old reflection and does not merely repeat generic follow-up wording.'
      ],
      fail_if: [
        'Output is empty or marks no new reflections despite the flagged omission.',
        'Output omits om.observations.flagged or reason.',
        'Output cites unsupported ids.',
        'Output focuses on stale dropper/additive/xhigh notes instead of the flagged exact detail.'
      ],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
}

async function curatorHardSchemaStaleNoise(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Exact implemented event: `om.observations.flagged` records observationIds plus a bounded one-line `reason` for reflector follow-up.', '2026-06-11T20:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Future reflection lifecycle names discussed: `om.reflections.deprecated` and `om.reflections.superseded`; not implemented yet.', '2026-06-11T20:01:00.000Z'),
    obs('cccccccccccc', 'Stale old plan: use additive context mode for memory projection.', '2026-06-11T20:02:00.000Z'),
    obs('dddddddddddd', 'Stale old cleanup: dropper soft threshold should manage active observation pressure.', '2026-06-11T20:03:00.000Z'),
    obs('eeeeeeeeeeee', 'Stale config note: reflectorThinking should remain xhigh.', '2026-06-11T20:04:00.000Z'),
    obs('ffffffffffff', 'Stale pool cap note: 80 active observations is the normal cleanup trigger.', '2026-06-11T20:05:00.000Z'),
    obs('111111111111', 'Current blocker: recall tool-use evals are missing; exact evidence should be recovered instead of trusting compressed near-matches.', '2026-06-11T20:06:00.000Z'),
    obs('222222222222', 'Current blocker: hard historical evals must not be weakened just to preserve pass rates; failures are signal.', '2026-06-11T20:07:00.000Z'),
    obs('333333333333', 'Noisy log: typecheck started.', '2026-06-11T20:08:00.000Z'),
    obs('444444444444', 'Noisy log: typecheck completed in 1.2s.', '2026-06-11T20:09:00.000Z'),
    obs('555555555555', 'Pinned validation: pnpm test && pnpm run typecheck passed after curator scheduler wiring.', '2026-06-11T20:10:00.000Z'),
    obs('666666666666', 'Current default: emergencyCurateWhenVisibleObservationsOver was lowered to 60.', '2026-06-11T20:11:00.000Z'),
  ];
  const reflections = [
    ref('999999999999', 'Memory lifecycle now uses curator follow-up flags, future reflection lifecycle work, hard evals, and curator emergency scheduling.', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', '111111111111', '222222222222', '666666666666']),
  ];
  const runCurator = await loadCuratorRunner();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: ['555555555555'], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 4, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCurator('curator-hard-schema-stale-noise', output, {
    id: 'curator-hard-schema-stale-noise',
    question: 'Did the curator preserve exact schema/blocker evidence while cleaning only stale/noisy observations from a mixed historical pool? Judge only the explicit action arrays in the JSON output: an id is preserved if it is absent from dropped and absent from unpinned.',
    rubric: {
      pass_if: [
        'The dropped array contains none of these protected ids: aaaaaaaaaaaa, bbbbbbbbbbbb, 111111111111, 222222222222, 555555555555, 666666666666.',
        'The unpinned arrays contain none of these protected ids: aaaaaaaaaaaa, bbbbbbbbbbbb, 111111111111, 222222222222, 555555555555, 666666666666.',
        'The pinned or flagged arrays include at least one exact schema id: aaaaaaaaaaaa or bbbbbbbbbbbb.',
        'The pinned or flagged arrays include at least one current eval/recall blocker id: 111111111111 or 222222222222.',
        'Every dropped id is one of these allowed stale/noise ids: cccccccccccc, dddddddddddd, eeeeeeeeeeee, ffffffffffff, 333333333333, 444444444444.'
      ],
      fail_if: [
        'The dropped array contains any protected id listed above.',
        'The unpinned arrays contain any protected id listed above.',
        'Neither exact schema id is pinned or flagged.',
        'Neither current eval/recall blocker id is pinned or flagged.',
        'The dropped array contains an id outside the allowed stale/noise set.'
      ],
    },
  }, judgeModel, started, [
    { label: 'must not drop exact schema/current blocker/validation/current config evidence', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', '111111111111', '222222222222', '555555555555', '666666666666'].includes(id)) },
    { label: 'must pin or flag exact schema names', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
    { label: 'must pin or flag current eval/recall blockers', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['111111111111', '222222222222'].includes(id)) },
    { label: 'drops must be limited to stale/noise ids', pass: (o) => curatorIds(o, 'dropped').every((id) => ['cccccccccccc', 'dddddddddddd', 'eeeeeeeeeeee', 'ffffffffffff', '333333333333', '444444444444'].includes(id)) },
  ], usage.total, agentDurationMs);
}



async function curatorBrutalHistoricalPressure(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('a00000000001', 'Implemented schema: `om.observations.flagged` appends follow-up requests with `observationIds` and normalized one-line `reason`.', '2026-06-11T21:00:00.000Z'),
    obs('a00000000002', 'Near-match but stale proposal: event should be named `om.observations.flag` with enum reason `reflection_missing_exact_detail`.', '2026-06-11T21:01:00.000Z'),
    obs('a00000000003', 'Implemented behavior: flags are implicitly resolved by later reflector review entry coverage, not by a separate resolved event.', '2026-06-11T21:02:00.000Z'),
    obs('a00000000004', 'Stale design note: add `om.observations.covered` when reflector covers an observation.', '2026-06-11T21:03:00.000Z'),
    obs('a00000000005', 'Proposed future reflection lifecycle event names are exact but not implemented: `om.reflections.deprecated` and `om.reflections.superseded`.', '2026-06-11T21:04:00.000Z'),
    obs('a00000000006', 'Stale near-match: use `om.reflection.deprecated` singular and mutate old reflections in place.', '2026-06-11T21:05:00.000Z'),
    obs('a00000000007', 'Current scheduler: curator runs after successful reflector review and emergency visible pressure, not from old active-pool soft threshold.', '2026-06-11T21:06:00.000Z'),
    obs('a00000000008', 'Stale scheduler: dropper should run whenever active observations exceed 30 soft target.', '2026-06-11T21:07:00.000Z'),
    obs('a00000000009', 'Current config default: emergencyCurateWhenVisibleObservationsOver is 60.', '2026-06-11T21:08:00.000Z'),
    obs('a00000000010', 'Stale config default: dropWhenActiveObservationsOver is 80 and normal cleanup waits for hard cap pressure.', '2026-06-11T21:09:00.000Z'),
    obs('a00000000011', 'Current eval doctrine: hard historical evals are expected to fail; do not weaken rubrics or fixtures just to preserve pass rate.', '2026-06-11T21:10:00.000Z'),
    obs('a00000000012', 'Stale eval note: keep all easy synthetic evals because passing 8/8 is sufficient signal.', '2026-06-11T21:11:00.000Z'),
    obs('a00000000013', 'Current blocker: recall model evals are missing; exact evidence should be recovered instead of trusting compressed near-matches.', '2026-06-11T21:12:00.000Z'),
    obs('a00000000014', 'Stale recall assumption: compaction details make recall redundant, so no recall evals are needed.', '2026-06-11T21:13:00.000Z'),
    obs('a00000000015', 'Pinned old failure: curator baseline failed 4/8 before prompt fixes; this is stale after later curator runs passed.', '2026-06-11T21:14:00.000Z'),
    obs('a00000000016', 'Later validation: curator low/high runs now record evaluated-model usage and pass the hard schema smoke after rubric clarification.', '2026-06-11T21:15:00.000Z'),
    obs('a00000000017', 'Pinned validation: `pnpm test && pnpm run typecheck` passed after curator emergency scheduling was wired.', '2026-06-11T21:16:00.000Z'),
    obs('a00000000018', 'Noisy log: memory update task started.', '2026-06-11T21:17:00.000Z'),
    obs('a00000000019', 'Noisy log containing scary token `om.observations.flagged` in debug output but no durable decision.', '2026-06-11T21:18:00.000Z'),
    obs('a00000000020', 'Noisy log: provider request took 812ms.', '2026-06-11T21:19:00.000Z'),
    obs('a00000000021', 'Assistant draft said maybe call the event `om.observation.flagged`; user later corrected to exact plural `om.observations.flagged`.', '2026-06-11T21:20:00.000Z'),
    obs('a00000000022', 'User correction: the exact durable event is plural `om.observations.flagged`; remember the plural observations segment.', '2026-06-11T21:21:00.000Z'),
    obs('a00000000023', 'Assistant draft said future event `om.reflections.supersedes`; user wanted `om.reflections.superseded`.', '2026-06-11T21:22:00.000Z'),
    obs('a00000000024', 'User correction: future exact event name is `om.reflections.superseded`, not supersedes.', '2026-06-11T21:23:00.000Z'),
    obs('a00000000025', 'Current implementation fact: curator tools reject non-candidate ids with `not_action_candidate`.', '2026-06-11T21:24:00.000Z'),
    obs('a00000000026', 'Stale implementation note: curator can mutate any reviewed id if it appears in read-only context.', '2026-06-11T21:25:00.000Z'),
    obs('a00000000027', 'Current model setting recommendation: curator should use low thinking because high had same pass rate and much higher token/time cost.', '2026-06-11T21:26:00.000Z'),
    obs('a00000000028', 'Stale model setting: curatorThinking must stay high for safety.', '2026-06-11T21:27:00.000Z'),
    obs('a00000000029', 'Noisy acknowledgement: sounds good, proceed.', '2026-06-11T21:28:00.000Z'),
    obs('a00000000030', 'Noisy acknowledgement: okay.', '2026-06-11T21:29:00.000Z'),
    obs('a00000000031', 'Current blocker: diagnostic prompts should run after unclear eval failures and must not change pass/fail.', '2026-06-11T21:30:00.000Z'),
    obs('a00000000032', 'Stale plan: do all eval implementation in one pass without checkpoints.', '2026-06-11T21:31:00.000Z'),
  ];
  const reflections = [
    ref('r00000000001', 'Memory has observation flags, future reflection lifecycle work, curator scheduling, and eval hardening.', ['a00000000001', 'a00000000005', 'a00000000007', 'a00000000011']),
    ref('r00000000002', 'Cleanup moved away from dropper thresholds; emergency curator pressure exists.', ['a00000000007', 'a00000000009']),
    ref('r00000000003', 'Curator evals passed after fixes; use the proven model settings.', ['a00000000016', 'a00000000027']),
  ];
  const runCurator = await loadCuratorRunner();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runCurator({
    ...auth,
    reflections,
    observations,
    pinnedObservationIds: ['a00000000015', 'a00000000017', 'a00000000028'],
    flaggedObservationIds: ['a00000000013', 'a00000000031'],
    protectedObservationIds: [],
    maxDropsAllowed: 8,
    thinkingLevel,
    maxTurns: 4,
    onUsage: usage.onUsage,
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCurator('curator-brutal-historical-pressure', output, {
    id: 'curator-brutal-historical-pressure',
    question: 'In a large confusable historical pool, did the curator protect exact current schema/blocker/correction evidence, unpin stale pinned items, and only drop safe stale/noise observations?',
    rubric: {
      pass_if: [
        'Does not drop protected current/correction ids: a00000000001, a00000000003, a00000000005, a00000000007, a00000000009, a00000000011, a00000000013, a00000000016, a00000000017, a00000000022, a00000000024, a00000000025, a00000000027, a00000000031.',
        'Pins or flags at least two exact-schema/correction ids among a00000000001, a00000000005, a00000000022, a00000000024 because generic reflections omit exact names/corrections.',
        'Pins or flags at least one current eval/recall/diagnostic blocker among a00000000011, a00000000013, a00000000031.',
        'Unpins stale pinned ids a00000000015 and/or a00000000028 when later evidence shows they are stale.',
        'Drops only safe stale/noise ids from this set: a00000000002, a00000000004, a00000000006, a00000000008, a00000000010, a00000000012, a00000000014, a00000000018, a00000000019, a00000000020, a00000000021, a00000000023, a00000000026, a00000000029, a00000000030, a00000000032.'
      ],
      fail_if: [
        'The dropped array contains any protected current/correction id. A protected id in pinned or flagged is not dropped and should not be counted as a drop.',
        'Fails to pin or flag exact schema/correction evidence despite generic reflections.',
        'Fails to pin or flag current eval/recall/diagnostic blocker evidence.',
        'Leaves both stale pinned ids still pinned with no unpin action.',
        'Drops ids outside the safe stale/noise set.',
        'The judge treats a flagged or pinned protected id as dropped even though it is absent from the dropped array.'
      ],
    },
  }, judgeModel, started, [
    { label: 'must not drop protected current/correction evidence', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['a00000000001', 'a00000000003', 'a00000000005', 'a00000000007', 'a00000000009', 'a00000000011', 'a00000000013', 'a00000000016', 'a00000000017', 'a00000000022', 'a00000000024', 'a00000000025', 'a00000000027', 'a00000000031'].includes(id)) },
    { label: 'must pin or flag at least two exact schema/correction ids', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].filter((id) => ['a00000000001', 'a00000000005', 'a00000000022', 'a00000000024'].includes(id)).length >= 2 },
    { label: 'must pin or flag an eval/recall/diagnostic blocker', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['a00000000011', 'a00000000013', 'a00000000031'].includes(id)) },
    { label: 'must unpin at least one stale pinned id', pass: (o) => curatorIds(o, 'unpinned').some((id) => ['a00000000015', 'a00000000028'].includes(id)) },
    { label: 'drops must be limited to safe stale/noise ids', pass: (o) => curatorIds(o, 'dropped').every((id) => ['a00000000002', 'a00000000004', 'a00000000006', 'a00000000008', 'a00000000010', 'a00000000012', 'a00000000014', 'a00000000018', 'a00000000019', 'a00000000020', 'a00000000021', 'a00000000023', 'a00000000026', 'a00000000029', 'a00000000030', 'a00000000032'].includes(id)) },
  ], usage.total, agentDurationMs);
}



async function curatorBrutalUnpinTrap(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('u00000000001', 'Pinned failure: `pnpm test` failed in tests/parser.test.ts with CRLF offset mismatch.', '2026-06-11T22:00:00.000Z'),
    obs('u00000000002', 'Later validation for parser passed: `pnpm test tests/parser.test.ts && pnpm run typecheck` succeeded after CRLF fix.', '2026-06-11T22:01:00.000Z'),
    obs('u00000000003', 'Pinned failure: deploy failed with `Error: EADDRINUSE` before port cleanup.', '2026-06-11T22:02:00.000Z'),
    obs('u00000000004', 'Misleading pass: docs deploy dry run passed, but production deploy still fails with `Error: EADDRINUSE`.', '2026-06-11T22:03:00.000Z'),
    obs('u00000000005', 'Current blocker: production deploy still fails with `Error: EADDRINUSE` until the port cleanup is applied.', '2026-06-11T22:04:00.000Z'),
    obs('u00000000006', 'Pinned failure: auth refresh token expiry test failed.', '2026-06-11T22:05:00.000Z'),
    obs('u00000000007', 'Stale near pass: auth login smoke test passed, but refresh token expiry test was not rerun.', '2026-06-11T22:06:00.000Z'),
    obs('u00000000008', 'Current blocker: do not mark auth fixed until refresh token expiry test passes.', '2026-06-11T22:07:00.000Z'),
    obs('u00000000009', 'Pinned validation: curator emergency scheduling passed full `pnpm test && pnpm run typecheck`.', '2026-06-11T22:08:00.000Z'),
    obs('u00000000010', 'Stale note: old dropper tests passed before dropper was deleted.', '2026-06-11T22:09:00.000Z'),
    obs('u00000000011', 'Noisy log: retry timer tick 1.', '2026-06-11T22:10:00.000Z'),
    obs('u00000000012', 'Noisy log: retry timer tick 2.', '2026-06-11T22:11:00.000Z'),
    obs('u00000000013', 'Exact current command to verify parser fix is `pnpm test tests/parser.test.ts && pnpm run typecheck`.', '2026-06-11T22:12:00.000Z'),
    obs('u00000000014', 'Exact current command to verify deploy fix is `pnpm deploy --production --dry-run`, not docs deploy.', '2026-06-11T22:13:00.000Z'),
    obs('u00000000015', 'Exact current command to verify auth fix is `pnpm test tests/auth-refresh.test.ts`.', '2026-06-11T22:14:00.000Z'),
  ];
  const reflections = [
    ref('ur0000000001', 'Parser CRLF failure is fixed; deploy and auth have some passing validation.', ['u00000000001', 'u00000000002', 'u00000000004', 'u00000000007']),
  ];
  const runCurator = await loadCuratorRunner();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: ['u00000000001', 'u00000000003', 'u00000000006', 'u00000000009'], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 4, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCurator('curator-brutal-unpin-trap', output, {
    id: 'curator-brutal-unpin-trap',
    question: 'Did the curator unpin only truly stale pinned failures while preserving still-current blockers hidden by misleading partial pass evidence?',
    rubric: {
      pass_if: [
        'Unpins u00000000001 because parser failure has exact later passing validation.',
        'Does not unpin u00000000003 or u00000000006 because deploy/auth remain current blockers despite misleading partial pass evidence.',
        'Pins or flags deploy/auth current blocker evidence among u00000000005, u00000000008, u00000000014, u00000000015.',
        'Does not drop current blocker or verification command ids u00000000005, u00000000008, u00000000013, u00000000014, u00000000015.',
        'Drops only stale/noise ids among u00000000010, u00000000011, u00000000012.'
      ],
      fail_if: [
        'Unpins current deploy/auth pinned failures u00000000003 or u00000000006.',
        'Fails to unpin truly stale parser pinned failure u00000000001.',
        'Drops current blocker or verification command evidence.',
        'Treats partial pass evidence as full fix evidence.'
      ],
    },
  }, judgeModel, started, [
    { label: 'must unpin stale parser failure', pass: (o) => curatorIds(o, 'unpinned').includes('u00000000001') },
    { label: 'must not unpin current deploy/auth failures', pass: (o) => !curatorIds(o, 'unpinned').some((id) => ['u00000000003', 'u00000000006'].includes(id)) },
    { label: 'must pin or flag deploy/auth blocker evidence', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['u00000000005', 'u00000000008', 'u00000000014', 'u00000000015'].includes(id)) },
    { label: 'must not drop blockers or verification commands', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['u00000000005', 'u00000000008', 'u00000000013', 'u00000000014', 'u00000000015'].includes(id)) },
    { label: 'drops must be limited to stale/noise', pass: (o) => curatorIds(o, 'dropped').every((id) => ['u00000000010', 'u00000000011', 'u00000000012'].includes(id)) },
  ], usage.total, agentDurationMs);
}

async function curatorBrutalContradictoryReflections(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('c00000000001', 'Reflection r-old says feature flag is `enableFastSync`, but user later rejected that exact name.', '2026-06-11T23:00:00.000Z'),
    obs('c00000000002', 'Current approved feature flag is `fast_sync_v2_enabled`; it supersedes rejected near-match `enableFastSync`.', '2026-06-11T23:01:00.000Z'),
    obs('c00000000003', 'Stale docs still mention `enableFastSync`; do not use it in final implementation.', '2026-06-11T23:02:00.000Z'),
    obs('c00000000004', 'Reflection r-new says auth bug is fixed, but no passing refresh-token-expiry test exists.', '2026-06-11T23:03:00.000Z'),
    obs('c00000000005', 'Current auth blocker: `pnpm test tests/auth-refresh.test.ts` still fails on refresh token expiry.', '2026-06-11T23:04:00.000Z'),
    obs('c00000000006', 'Reflection r-plan says recall is redundant after compaction.', '2026-06-11T23:05:00.000Z'),
    obs('c00000000007', 'Current decision: recall evals are required because exact evidence can be missing from compressed memory.', '2026-06-11T23:06:00.000Z'),
    obs('c00000000008', 'Noisy log: compaction hook ran.', '2026-06-11T23:07:00.000Z'),
    obs('c00000000009', 'Noisy log: status command rendered.', '2026-06-11T23:08:00.000Z'),
    obs('c00000000010', 'Exact schema correction: use `om.observations.flagged`, not `om.observation.flagged`.', '2026-06-11T23:09:00.000Z'),
    obs('c00000000011', 'Exact reflection lifecycle correction: future name is `om.reflections.superseded`, not `om.reflections.supersedes`.', '2026-06-11T23:10:00.000Z'),
    obs('c00000000012', 'Stale note: all curator evals passed, so no more hard evals needed.', '2026-06-11T23:11:00.000Z'),
    obs('c00000000013', 'Current decision: hard eval failures are expected signal and should not be weakened to pass.', '2026-06-11T23:12:00.000Z'),
  ];
  const reflections = [
    ref('cr0000000001', 'Use enableFastSync for the feature flag.', ['c00000000001']),
    ref('cr0000000002', 'Auth refresh token expiry is fixed.', ['c00000000004']),
    ref('cr0000000003', 'Recall is likely redundant after compaction.', ['c00000000006']),
  ];
  const runCurator = await loadCuratorRunner();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 3, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCurator('curator-brutal-contradictory-reflections', output, {
    id: 'curator-brutal-contradictory-reflections',
    question: 'Did the curator detect multiple confidently wrong reflections and preserve/flag corrective evidence instead of trusting the reflections or just cleaning noise?',
    rubric: {
      pass_if: [
        'Pins or flags current feature flag correction evidence c00000000002 and/or stale-trap evidence c00000000003.',
        'Pins or flags current auth failure evidence c00000000005.',
        'Pins or flags recall-required evidence c00000000007 and/or hard-eval doctrine c00000000013.',
        'Pins or flags exact schema correction c00000000010 and/or c00000000011.',
        'Does not drop corrective/current ids c00000000002, c00000000005, c00000000007, c00000000010, c00000000011, c00000000013.',
        'Drops, if any, are limited to noise/stale ids c00000000008, c00000000009, c00000000012.'
      ],
      fail_if: [
        'Trusts wrong reflections and takes no corrective pin/flag actions.',
        'Drops current corrective evidence.',
        'Only drops noise while ignoring reflection contradictions.',
        'Preserves stale enableFastSync as current.'
      ],
    },
  }, judgeModel, started, [
    { label: 'must pin or flag feature flag correction', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['c00000000002', 'c00000000003'].includes(id)) },
    { label: 'must pin or flag auth failure correction', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].includes('c00000000005') },
    { label: 'must pin or flag recall/hard-eval correction', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['c00000000007', 'c00000000013'].includes(id)) },
    { label: 'must pin or flag exact schema correction', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['c00000000010', 'c00000000011'].includes(id)) },
    { label: 'must not drop corrective/current evidence', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['c00000000002', 'c00000000005', 'c00000000007', 'c00000000010', 'c00000000011', 'c00000000013'].includes(id)) },
    { label: 'drops must be limited to noise/stale ids', pass: (o) => curatorIds(o, 'dropped').every((id) => ['c00000000008', 'c00000000009', 'c00000000012'].includes(id)) },
  ], usage.total, agentDurationMs);
}


const allCases = [
  observerHardCurrentStale,
  observerHardAssistantOnly,
  observerHardSchemaMess,
  reflectorHardCompression,
  reflectorSupersessionRelation,
  reflectorReviewedZero,
  reflectorHardRepairFlag,
  curatorFlagsMissingExactDetail,
  curatorContradictoryReflection,
  curatorHardSchemaStaleNoise,
  curatorBrutalHistoricalPressure,
  curatorBrutalUnpinTrap,
  curatorBrutalContradictoryReflections,
];

async function main() {
  const args = parseArgs();
  curatorMode = args.curatorMode;
  fs.mkdirSync(args.outDir, { recursive: true });
  const cases = args.only ? allCases.filter((c) => c.name.includes(args.only!)) : allCases;
  const records: AgentEvalRecord[] = [];
  for (const c of cases) {
    try { records.push(await c(args.model, args.judgeModel, args.thinkingLevel)); }
    catch (error) {
      records.push({ id: c.name, agent: c.name.startsWith('observer') ? 'observer' : c.name.startsWith('reflector') ? 'reflector' : 'curator', output: undefined, passed: false, durationMs: 0, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
    }
    fs.writeFileSync(path.join(args.outDir, 'results.partial.json'), JSON.stringify(records, null, 2));
  }
  const summary = {
    passed: records.filter((r) => r.passed).length,
    total: records.length,
    failed: records.filter((r) => !r.passed).map((r) => ({ id: r.id, agent: r.agent, judge: r.judge, error: r.error })),
    durationMs: sumDuration(records, 'durationMs'),
    agentDurationMs: sumDuration(records, 'agentDurationMs'),
    judgeDurationMs: sumDuration(records, 'judgeDurationMs'),
    diagnosisDurationMs: sumDuration(records, 'diagnosisDurationMs'),
    usage: sumUsage(records, 'usage'),
    judgeUsage: sumUsage(records, 'judgeUsage'),
    diagnosisUsage: sumUsage(records, 'diagnosisUsage'),
  };
  fs.writeFileSync(path.join(args.outDir, 'results.json'), JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(args.outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.passed === summary.total ? 0 : 1;
}

await main();
