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
};

let omAgents: OmAgents | undefined;

async function loadOmAgents(): Promise<OmAgents> {
  if (omAgents) return omAgents;
  const base = new URL('../../extensions/pi-observational-memory/src/agents/', import.meta.url);
  const observer = await import(new URL('observer/agent.ts', base).href) as { runObserver: OmAgents['runObserver'] };
  const reflector = await import(new URL('reflector/agent.ts', base).href) as { runReflector: OmAgents['runReflector'] };
  const curator = await import(new URL('curator/agent.ts', base).href) as { runCurator: OmAgents['runCurator'] };
  omAgents = { runObserver: observer.runObserver, runReflector: reflector.runReflector, runCurator: curator.runCurator };
  return omAgents;
}

type AgentEvalRecord = {
  id: string;
  agent: 'observer' | 'reflector' | 'curator';
  output: unknown;
  judge?: unknown;
  passed: boolean;
  durationMs: number;
  usage?: TokenUsage;
  judgeUsage?: TokenUsage;
  error?: string;
};

type Args = { model: string; judgeModel: string; outDir: string; thinkingLevel: ModelThinkingLevel; only?: string };

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
  };
}

function parseModelSpec(spec: string): [provider: string, id: string] {
  const [provider, ...rest] = spec.split('/');
  const id = rest.join('/');
  if (!provider || !id) throw new Error(`model must be provider/id, got: ${spec}`);
  return [provider, id];
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

async function judged(id: string, agent: AgentEvalRecord['agent'], output: unknown, probe: Probe, judgeModel: string, started: number): Promise<AgentEvalRecord> {
  const answer = JSON.stringify(output, null, 2);
  const { run, judge } = await runJudge(probe, answer, judgeModel);
  return { id, agent, output, judge, passed: run.status === 0 && judge.passed, durationMs: Date.now() - started, judgeUsage: run.usage };
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
  };
}

async function judgedCurator(
  id: string,
  output: CuratorActionResult | undefined,
  probe: Probe,
  judgeModel: string,
  started: number,
  checks: Array<{ label: string; pass: (output: CuratorActionResult | undefined) => boolean }>,
): Promise<AgentEvalRecord> {
  const deterministic = deterministicCuratorRecord(id, output, started, checks);
  if (!deterministic.passed) return deterministic;
  return judged(id, 'curator', output ?? {}, probe, judgeModel, started);
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
  const output = await runObserver({
    ...auth,
    priorReflections: ['[rrrrrrrrrrrr] User requires exact current-vs-stale relationships.'],
    priorObservations: [],
    chunk,
    allowedSourceEntryIds: ['user-a', 'assistant-b', 'user-c', 'assistant-d'],
    thinkingLevel,
    maxTurns: 6,
  });
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
  }, judgeModel, started);
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
  const output = await runObserver({ ...auth, priorReflections: [], priorObservations: [], chunk, allowedSourceEntryIds: ['assistant-a', 'tool-b', 'user-c'], thinkingLevel, maxTurns: 6 });
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
  }, judgeModel, started);
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
  const output = await runReflector({ ...auth, reflections: [], observations, thinkingLevel, maxTurns: 6 });
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
  }, judgeModel, started);
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
  const output = await runReflector({ ...auth, reflections: [], observations, thinkingLevel, maxTurns: 6 });
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
  }, judgeModel, started);
}

async function reflectorReviewedZero(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Assistant said okay.', '2026-06-07T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'User said thanks.', '2026-06-07T10:01:00.000Z'),
  ];
  const { runReflector } = await loadOmAgents();
  const output = await runReflector({ ...auth, reflections: [ref('eeeeeeeeeeee', 'User prefers concise memory updates.', ['aaaaaaaaaaaa'])], observations, thinkingLevel, maxTurns: 4 });
  return judged('reflector-reviewed-zero-noise', 'reflector', output ?? [], {
    id: 'reflector-reviewed-zero-noise',
    question: 'Did the reflector correctly add no durable reflections for acknowledgement-only observations?',
    rubric: {
      pass_if: ['Output is empty or otherwise indicates no new durable reflection was recorded.'],
      fail_if: ['Output records a durable reflection for thanks/okay acknowledgement noise.'],
    },
  }, judgeModel, started);
}

async function curatorFlagsMissingExactDetail(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Migration dry run command `pnpm migrate -- --dry-run` failed with exact error `Error: SQLITE_BUSY at src/db/migrate.ts:88`.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'User says the SQLITE_BUSY failure remains the current blocker and WAL must stay enabled via `PRAGMA journal_mode=WAL`.', '2026-06-07T09:01:00.000Z'),
  ];
  const reflections = [ref('cccccccccccc', 'Migration dry run failed with a database lock; WAL should stay enabled.', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])];
  const { runCurator } = await loadOmAgents();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 1, thinkingLevel, maxTurns: 4 });
  return judgedCurator('curator-flags-missing-exact-detail', output, {
    id: 'curator-flags-missing-exact-detail',
    question: 'Did the curator avoid dropping evidence and request reflector follow-up for exact missing blocker details?',
    rubric: {
      pass_if: [
        'Output flags aaaaaaaaaaaa and/or bbbbbbbbbbbb for reflector follow-up, or pins aaaaaaaaaaaa/bbbbbbbbbbbb to preserve exact detail.',
        'The dropped array does not contain aaaaaaaaaaaa or bbbbbbbbbbbb.',
        'A reason mentions missing exact detail, exact command/error, SQLITE_BUSY, WAL, or reflection coverage; it does not need to repeat every exact string if the flagged/pinned observation id contains that evidence.',
      ],
      fail_if: ['The dropped array contains aaaaaaaaaaaa or bbbbbbbbbbbb.', 'Output takes no action despite reflection omitting src/db/migrate.ts:88 and PRAGMA journal_mode=WAL.', 'Output only unpins observations.'],
    },
  }, judgeModel, started, [
    { label: 'must not drop exact blocker observations', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
    { label: 'must pin or flag at least one exact blocker observation', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
  ]);
}

async function curatorUnpinsStalePinnedFailure(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Old pinned failure: `pnpm test` failed in tests/parser.test.ts with CRLF offset mismatch.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Later validation passed: `pnpm test && pnpm run typecheck` completed successfully after the CRLF fix.', '2026-06-07T10:00:00.000Z'),
  ];
  const reflections = [ref('cccccccccccc', 'The CRLF offset failure is fixed; later pnpm test and typecheck passed.', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])];
  const { runCurator } = await loadOmAgents();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: ['aaaaaaaaaaaa'], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 1, thinkingLevel, maxTurns: 4 });
  return judgedCurator('curator-unpins-stale-pinned-failure', output, {
    id: 'curator-unpins-stale-pinned-failure',
    question: 'Did the curator unpin an old pinned failure after later reflection records that validation passed?',
    rubric: {
      pass_if: [
        'Output unpins aaaaaaaaaaaa, or otherwise clearly stops forcing the old failure into next context.',
        'Output does not drop bbbbbbbbbbbb, which carries the passing validation evidence.',
        'Output does not flag the old failure as unresolved.',
      ],
      fail_if: ['Output keeps only pinning/flagging aaaaaaaaaaaa as if the failure is current.', 'Output drops bbbbbbbbbbbb.', 'Output takes no action while a stale pinned failure remains pinned.'],
    },
  }, judgeModel, started, [
    { label: 'must unpin stale pinned failure', pass: (o) => curatorIds(o, 'unpinned').includes('aaaaaaaaaaaa') },
    { label: 'must not drop passing validation evidence', pass: (o) => !curatorIds(o, 'dropped').includes('bbbbbbbbbbbb') },
  ]);
}

async function curatorDropsNoiseKeepsPreference(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Noisy transient log: webpack progress 17% module build 142/900.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Noisy transient log: webpack progress 18% module build 151/900.', '2026-06-07T09:01:00.000Z'),
    obs('cccccccccccc', 'Current user preference: use pnpm instead of npm for this repo.', '2026-06-07T09:02:00.000Z'),
  ];
  const reflections = [ref('dddddddddddd', 'User prefers pnpm instead of npm for this repo.', ['cccccccccccc'])];
  const { runCurator } = await loadOmAgents();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 2, thinkingLevel, maxTurns: 4 });
  return deterministicCuratorRecord('curator-drops-noise-keeps-preference', output, started, [
    { label: 'must not drop durable user preference', pass: (o) => !curatorIds(o, 'dropped').includes('cccccccccccc') },
    { label: 'must drop only transient noise ids', pass: (o) => curatorIds(o, 'dropped').every((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
  ]);
}

async function curatorKeepsStaleTrapEvidence(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Canonical approved feature flag is `fast_sync_v2_enabled`, which supersedes rejected near-match `enableFastSync`.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Stale trap: `enableFastSync` appears in old docs and must not be used for the final implementation.', '2026-06-07T09:01:00.000Z'),
    obs('cccccccccccc', 'Transient log: feature scan completed in 122ms.', '2026-06-07T09:02:00.000Z'),
    obs('dddddddddddd', 'User asks to preserve exact current-vs-stale relationship when compacting.', '2026-06-07T09:03:00.000Z'),
  ];
  const reflections = [ref('eeeeeeeeeeee', 'Approved feature flag is fast_sync_v2_enabled.', ['aaaaaaaaaaaa'])];
  const { runCurator } = await loadOmAgents();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 2, thinkingLevel, maxTurns: 4 });
  return judgedCurator('curator-keeps-stale-trap-evidence', output, {
    id: 'curator-keeps-stale-trap-evidence',
    question: 'Did the curator recognize that the reflection omitted important stale/current trap semantics?',
    rubric: {
      pass_if: [
        'The curator recognizes the rejected/stale near-match or stale/current relationship as important evidence.',
        'The curator uses pin or flag semantics to keep or repair that omitted relationship.',
        'Any cleanup is limited to semantically transient noise.',
      ],
      fail_if: ['The curator treats the stale/current trap as redundant because the reflection names only the current value.', 'The curator only performs noise cleanup and ignores the omitted rejected near-match relation.'],
    },
  }, judgeModel, started, [
    { label: 'must not drop stale/current trap evidence', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'dddddddddddd'].includes(id)) },
    { label: 'must pin or flag stale/current trap evidence', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'dddddddddddd'].includes(id)) }, 
  ]);
}

async function curatorMixedReviewedPool(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Old failure: `pnpm test` failed in tests/parser.test.ts with CRLF offset mismatch.', '2026-06-07T08:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Later validation passed: `pnpm test && pnpm run typecheck` passed after CRLF fix.', '2026-06-07T09:00:00.000Z'),
    obs('cccccccccccc', 'Current constraint: use pnpm, never npm, in this repo.', '2026-06-07T09:01:00.000Z'),
    obs('dddddddddddd', 'Exact unresolved blocker: `Error: ECONNRESET at src/api/client.ts:42` remains open.', '2026-06-07T09:02:00.000Z'),
    obs('eeeeeeeeeeee', 'Noisy log: dev server rebuilt chunk vendor in 181ms.', '2026-06-07T09:03:00.000Z'),
    obs('ffffffffffff', 'Noisy log: dev server rebuilt chunk app in 190ms.', '2026-06-07T09:04:00.000Z'),
    obs('111111111111', 'Assistant noted no source changes were needed for README typo.', '2026-06-07T09:05:00.000Z'),
    obs('222222222222', 'User says the ECONNRESET blocker should be treated as current until a passing retry is shown.', '2026-06-07T09:06:00.000Z'),
    obs('333333333333', 'Old plan to use yarn was rejected when pnpm rule was approved.', '2026-06-07T09:07:00.000Z'),
    obs('444444444444', 'Noisy log: heartbeat ok.', '2026-06-07T09:08:00.000Z'),
  ];
  const reflections = [
    ref('999999999999', 'CRLF parser failure was fixed; pnpm test and typecheck passed.', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb']),
    ref('888888888888', 'Use pnpm instead of npm/yarn in this repo.', ['cccccccccccc', '333333333333']),
  ];
  const { runCurator } = await loadOmAgents();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: ['aaaaaaaaaaaa'], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 3, thinkingLevel, maxTurns: 4 });
  return deterministicCuratorRecord('curator-mixed-reviewed-pool', output, started, [
    { label: 'must not drop durable constraints or blockers', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['cccccccccccc', 'dddddddddddd', '222222222222', '333333333333'].includes(id)) },
    { label: 'dropped ids must stay within cap', pass: (o) => curatorIds(o, 'dropped').length <= 3 },
    { label: 'must unpin stale fixed failure', pass: (o) => curatorIds(o, 'unpinned').includes('aaaaaaaaaaaa') },
    { label: 'must pin or flag unresolved blocker evidence missing from reflections', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['dddddddddddd', '222222222222'].includes(id)) },
  ]);
}

async function curatorMinimalPin(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Exact approved config path: `/etc/pi/agent/memory.toml`.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Exact rejected config path: `/etc/pi/memory.toml` is stale and should not be used.', '2026-06-07T09:01:00.000Z'),
    obs('cccccccccccc', 'Exact command `pnpm test && pnpm run typecheck` passed.', '2026-06-07T09:02:00.000Z'),
    obs('dddddddddddd', 'Exact harmless log: cache warmed in 15ms.', '2026-06-07T09:03:00.000Z'),
  ];
  const reflections = [
    ref('eeeeeeeeeeee', 'Approved memory config path is /etc/pi/agent/memory.toml; /etc/pi/memory.toml is rejected stale.', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb']),
    ref('ffffffffffff', 'Validation passed with exact command `pnpm test && pnpm run typecheck`.', ['cccccccccccc']),
  ];
  const { runCurator } = await loadOmAgents();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 1, thinkingLevel, maxTurns: 4 });
  return deterministicCuratorRecord('curator-minimal-pin-pressure', output, started, [
    { label: 'must not pin already-reflected exact details', pass: (o) => !curatorIds(o, 'pinned').some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc'].includes(id)) },
    { label: 'must not drop reflected durable details', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc'].includes(id)) },
  ]);
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
  const { runCurator } = await loadOmAgents();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 2, thinkingLevel, maxTurns: 4 });
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
  ]);
}

async function curatorOneShotPriority(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Pinned old failure: deploy failed with `Error: EADDRINUSE` before port cleanup.', '2026-06-07T08:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Later deploy passed after port cleanup; `pnpm deploy --dry-run` succeeded.', '2026-06-07T09:00:00.000Z'),
    obs('cccccccccccc', 'Unreflected exact current secret name: `PI_AGENT_SESSION_KEY`, replacing stale `SESSION_SECRET`.', '2026-06-07T09:01:00.000Z'),
    obs('dddddddddddd', 'Stale near-match `SESSION_SECRET` appears in old examples and must not be used.', '2026-06-07T09:02:00.000Z'),
    obs('eeeeeeeeeeee', 'Noisy log: retry timer tick 1.', '2026-06-07T09:03:00.000Z'),
    obs('ffffffffffff', 'Noisy log: retry timer tick 2.', '2026-06-07T09:04:00.000Z'),
  ];
  const reflections = [ref('999999999999', 'Deploy now passes after port cleanup.', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])];
  const { runCurator } = await loadOmAgents();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: ['aaaaaaaaaaaa'], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 2, thinkingLevel, maxTurns: 4 });
  return judgedCurator('curator-one-shot-priority', output, {
    id: 'curator-one-shot-priority',
    question: 'With multiple possible actions in one curator pass, did the curator choose safe high-priority actions instead of unsafe cleanup?',
    rubric: {
      pass_if: [
        'Output does not drop cccccccccccc or dddddddddddd because the secret replacement relation is unreflected.',
        'Output chooses coherent high-priority action(s): unpin aaaaaaaaaaaa, flag/pin cccccccccccc and/or dddddddddddd, and/or drop only noisy eeeeeeeeeeee/ffffffffffff.',
        'Multiple action types are allowed in one curator pass when each action is safe.'
      ],
      fail_if: ['The dropped array contains cccccccccccc or dddddddddddd.', 'The dropped array contains bbbbbbbbbbbb while old failure remains pinned.', 'Output prioritizes noisy cleanup while also losing unreflected critical relation evidence.'],
    },
  }, judgeModel, started, [
    { label: 'must not drop unreflected secret relation evidence', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['cccccccccccc', 'dddddddddddd'].includes(id)) },
    { label: 'must take a high-priority safe action', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged'), ...curatorIds(o, 'unpinned'), ...curatorIds(o, 'dropped')].length > 0 },
  ]);
}


const allCases = [
  observerHardCurrentStale,
  observerHardAssistantOnly,
  reflectorHardCompression,
  reflectorSupersessionRelation,
  reflectorReviewedZero,
  curatorFlagsMissingExactDetail,
  curatorUnpinsStalePinnedFailure,
  curatorDropsNoiseKeepsPreference,
  curatorKeepsStaleTrapEvidence,
  curatorMixedReviewedPool,
  curatorMinimalPin,
  curatorContradictoryReflection,
  curatorOneShotPriority,
];

async function main() {
  const args = parseArgs();
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
  };
  fs.writeFileSync(path.join(args.outDir, 'results.json'), JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(args.outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.passed === summary.total ? 0 : 1;
}

await main();
