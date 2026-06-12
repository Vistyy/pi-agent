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
  runDropper: (args: Record<string, unknown>) => Promise<string[] | undefined>;
  runCurator: (args: Record<string, unknown>) => Promise<CuratorActionResult | undefined>;
};

let omAgents: OmAgents | undefined;

async function loadOmAgents(): Promise<OmAgents> {
  if (omAgents) return omAgents;
  const base = new URL('../../extensions/pi-observational-memory/src/agents/', import.meta.url);
  const observer = await import(new URL('observer/agent.ts', base).href) as { runObserver: OmAgents['runObserver'] };
  const reflector = await import(new URL('reflector/agent.ts', base).href) as { runReflector: OmAgents['runReflector'] };
  const dropper = await import(new URL('dropper/agent.ts', base).href) as { runDropper: OmAgents['runDropper'] };
  const curator = await import(new URL('curator/agent.ts', base).href) as { runCurator: OmAgents['runCurator'] };
  omAgents = { runObserver: observer.runObserver, runReflector: reflector.runReflector, runDropper: dropper.runDropper, runCurator: curator.runCurator };
  return omAgents;
}

type AgentEvalRecord = {
  id: string;
  agent: 'observer' | 'reflector' | 'dropper' | 'curator';
  output: unknown;
  judge?: unknown;
  passed: boolean;
  durationMs: number;
  usage?: TokenUsage;
  judgeUsage?: TokenUsage;
  error?: string;
};

type Args = { model: string; judgeModel: string; outDir: string; thinkingLevel: ModelThinkingLevel };

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

async function dropperHardSafety(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Redundant older note: use SQLite for job state.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Unique exact unresolved blocker: SQLITE_BUSY at src/db/migrate.ts:88.', '2026-06-07T09:05:00.000Z'),
    obs('cccccccccccc', 'Recent protected note: user says do not call CRLF offset fixed.', '2026-06-07T09:10:00.000Z'),
    obs('dddddddddddd', 'Superseded older note: Redis job-state plan.', '2026-06-07T08:00:00.000Z'),
  ];
  const reflections = [
    ref('eeeeeeeeeeee', 'Current job-state decision is SQLite; Redis plan is rejected stale.', ['aaaaaaaaaaaa', 'dddddddddddd']),
  ];
  const { runDropper } = await loadOmAgents();
  const output = await runDropper({ ...auth, reflections, observations, protectedObservationIds: ['cccccccccccc'], maxDropsAllowed: 2, thinkingLevel, maxTurns: 4 });
  return judged('dropper-safe-redundant-only', 'dropper', output ?? [], {
    id: 'dropper-safe-redundant-only',
    question: 'Did the dropper choose only safe older reviewed redundant/superseded observations and avoid unique/protected details?',
    rubric: {
      pass_if: [
        'Output includes aaaaaaaaaaaa and/or dddddddddddd as safe drops.',
        'Output does not include bbbbbbbbbbbb because it uniquely carries exact unresolved SQLITE_BUSY blocker detail.',
        'Output does not include cccccccccccc because it is protected/recent and should not have been eligible.',
        'Output includes no more than two ids.',
      ],
      fail_if: ['Output drops bbbbbbbbbbbb.', 'Output drops cccccccccccc.', 'Output includes more than two ids.'],
    },
  }, judgeModel, started);
}

async function dropperKeepsUnreflectedTrap(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Approved feature flag is fast_sync_v2_enabled, which supersedes enableFastSync.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'enableFastSync is a stale near-match trap and explicitly not current.', '2026-06-07T09:01:00.000Z'),
    obs('cccccccccccc', 'Background reminder: unrelated batch log line 42.', '2026-06-07T09:02:00.000Z'),
  ];
  const reflections = [ref('dddddddddddd', 'Approved feature flag is fast_sync_v2_enabled.', ['aaaaaaaaaaaa'])];
  const { runDropper } = await loadOmAgents();
  const output = await runDropper({ ...auth, reflections, observations, protectedObservationIds: [], maxDropsAllowed: 2, thinkingLevel, maxTurns: 4 });
  return judged('dropper-keeps-unreflected-stale-trap', 'dropper', output ?? [], {
    id: 'dropper-keeps-unreflected-stale-trap',
    question: 'Did the dropper avoid dropping stale-trap evidence that is not covered by a reflection, while allowing irrelevant background to be dropped?',
    rubric: {
      pass_if: [
        'Output is a drop-id list and does not include bbbbbbbbbbbb because the stale near-match trap enableFastSync is not preserved in the reflection.',
        'Output may include aaaaaaaaaaaa because its current-value detail is covered by the reflection, and may include cccccccccccc as irrelevant background/noise.',
        'Output includes no more than two ids.',
      ],
      fail_if: ['Output includes bbbbbbbbbbbb.', 'Output includes more than two ids.', 'Output includes ids other than aaaaaaaaaaaa, bbbbbbbbbbbb, or cccccccccccc.'],
    },
  }, judgeModel, started);
}

async function dropperDropsRepeatedNoise(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Repeated red-herring records batch 1 all say enableFastSync is stale and not current.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Repeated red-herring records batch 2 all say enableFastSync is stale and not current.', '2026-06-07T09:01:00.000Z'),
    obs('cccccccccccc', 'Canonical approved feature flag is fast_sync_v2_enabled, superseding enableFastSync.', '2026-06-07T09:02:00.000Z'),
  ];
  const reflections = [ref('dddddddddddd', 'fast_sync_v2_enabled supersedes enableFastSync; enableFastSync is stale/not current.', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc'])];
  const { runDropper } = await loadOmAgents();
  const output = await runDropper({ ...auth, reflections, observations, protectedObservationIds: [], maxDropsAllowed: 2, thinkingLevel, maxTurns: 4 });
  return judged('dropper-drops-reflected-repeated-noise', 'dropper', output ?? [], {
    id: 'dropper-drops-reflected-repeated-noise',
    question: 'Did the dropper drop redundant repeated red-herring observations once their durable meaning is covered by a reflection, while keeping the canonical source detail?',
    rubric: {
      pass_if: [
        'Output is a drop-id list and includes at least one of aaaaaaaaaaaa or bbbbbbbbbbbb as safe redundant repeated noise covered by the reflection.',
        'Output does not include cccccccccccc, which means the canonical source detail for the current value and supersession relation is kept.',
        'Output includes no more than two ids.',
      ],
      fail_if: ['Output includes cccccccccccc.', 'Output includes neither aaaaaaaaaaaa nor bbbbbbbbbbbb.', 'Output includes more than two ids.', 'Output includes ids other than aaaaaaaaaaaa, bbbbbbbbbbbb, or cccccccccccc.'],
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
  return judged('curator-flags-missing-exact-detail', 'curator', output ?? {}, {
    id: 'curator-flags-missing-exact-detail',
    question: 'Did the curator avoid dropping evidence and request reflector follow-up for exact missing blocker details?',
    rubric: {
      pass_if: [
        'Output flags aaaaaaaaaaaa and/or bbbbbbbbbbbb for reflector follow-up, or pins aaaaaaaaaaaa to preserve exact detail.',
        'Output does not drop aaaaaaaaaaaa or bbbbbbbbbbbb.',
        'If a reason is present, it mentions missing exact detail, the exact path, SQLITE_BUSY, WAL, or reflection coverage.',
      ],
      fail_if: ['Output drops aaaaaaaaaaaa or bbbbbbbbbbbb.', 'Output takes no action despite reflection omitting src/db/migrate.ts:88 and PRAGMA journal_mode=WAL.', 'Output only unpins observations.'],
    },
  }, judgeModel, started);
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
  return judged('curator-unpins-stale-pinned-failure', 'curator', output ?? {}, {
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
  }, judgeModel, started);
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
  return judged('curator-drops-noise-keeps-preference', 'curator', output ?? {}, {
    id: 'curator-drops-noise-keeps-preference',
    question: 'Did the curator drop only transient noise while preserving the durable user preference?',
    rubric: {
      pass_if: [
        'Output drops aaaaaaaaaaaa and/or bbbbbbbbbbbb as transient noise.',
        'Output does not drop cccccccccccc because it carries a user preference/current constraint.',
        'Output includes no more than two dropped ids.',
      ],
      fail_if: ['Output drops cccccccccccc.', 'Output includes more than two dropped ids.', 'Output flags or pins transient webpack progress logs instead of dropping them.'],
    },
  }, judgeModel, started);
}

async function main() {
  const args = parseArgs();
  fs.mkdirSync(args.outDir, { recursive: true });
  const cases = [observerHardCurrentStale, observerHardAssistantOnly, reflectorHardCompression, reflectorSupersessionRelation, reflectorReviewedZero, dropperHardSafety, dropperKeepsUnreflectedTrap, dropperDropsRepeatedNoise, curatorFlagsMissingExactDetail, curatorUnpinsStalePinnedFailure, curatorDropsNoiseKeepsPreference];
  const records: AgentEvalRecord[] = [];
  for (const c of cases) {
    try { records.push(await c(args.model, args.judgeModel, args.thinkingLevel)); }
    catch (error) {
      records.push({ id: c.name, agent: c.name.startsWith('observer') ? 'observer' : c.name.startsWith('reflector') ? 'reflector' : c.name.startsWith('curator') ? 'curator' : 'dropper', output: undefined, passed: false, durationMs: 0, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
    }
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
