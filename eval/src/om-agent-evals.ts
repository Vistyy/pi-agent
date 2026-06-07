import fs from 'node:fs';
import path from 'node:path';
import { AuthStorage, ModelRegistry } from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai';
import { DEFAULT_MODEL } from './lib/pi.js';
import { runJudge } from './lib/judge.js';
import type { Probe, TokenUsage } from './lib/types.js';

type Observation = { id: string; content: string; timestamp: string; sourceEntryIds: string[]; tokenCount: number };
type Reflection = { id: string; content: string; supportingObservationIds: string[]; tokenCount: number };
type OmAgents = {
  runObserver: (args: Record<string, unknown>) => Promise<Observation[] | undefined>;
  runReflector: (args: Record<string, unknown>) => Promise<Reflection[] | undefined>;
  runDropper: (args: Record<string, unknown>) => Promise<string[] | undefined>;
};

let omAgents: OmAgents | undefined;

async function loadOmAgents(): Promise<OmAgents> {
  if (omAgents) return omAgents;
  const base = new URL('../../extensions/pi-observational-memory/src/agents/', import.meta.url);
  const observer = await import(new URL('observer/agent.ts', base).href) as { runObserver: OmAgents['runObserver'] };
  const reflector = await import(new URL('reflector/agent.ts', base).href) as { runReflector: OmAgents['runReflector'] };
  const dropper = await import(new URL('dropper/agent.ts', base).href) as { runDropper: OmAgents['runDropper'] };
  omAgents = { runObserver: observer.runObserver, runReflector: reflector.runReflector, runDropper: dropper.runDropper };
  return omAgents;
}

type AgentEvalRecord = {
  id: string;
  agent: 'observer' | 'reflector' | 'dropper';
  output: unknown;
  judge?: unknown;
  passed: boolean;
  durationMs: number;
  usage?: TokenUsage;
  judgeUsage?: TokenUsage;
  error?: string;
};

type Args = { model: string; judgeModel: string; outDir: string };

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

async function observerHardCurrentStale(modelSpec: string, judgeModel: string): Promise<AgentEvalRecord> {
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
    thinkingLevel: 'off',
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

async function observerHardAssistantOnly(modelSpec: string, judgeModel: string): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const chunk = [
    '[Source entry id: assistant-a] 2026-06-07 11:00 Assistant: I changed the parser entrypoint from src/parser.ts to src/parser/index.ts.',
    '[Source entry id: tool-b] 2026-06-07 11:01 Tool result: npm test failed: FAIL tests/parser-regression.test.ts > keeps CRLF offsets. Expected column 17, received column 16.',
    '[Source entry id: user-c] 2026-06-07 11:02 User: Do not call that fixed. The CRLF offset failure is still unresolved.',
  ].join('\n');
  const { runObserver } = await loadOmAgents();
  const output = await runObserver({ ...auth, priorReflections: [], priorObservations: [], chunk, allowedSourceEntryIds: ['assistant-a', 'tool-b', 'user-c'], thinkingLevel: 'off', maxTurns: 6 });
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

async function reflectorHardCompression(modelSpec: string, judgeModel: string): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Earlier proposal Redis for job state is rejected; current decision is SQLite at /tmp/jobs.db.', '2026-06-07T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Migration dry run command `npm run migrate -- --dry-run` failed with `Error: SQLITE_BUSY at src/db/migrate.ts:88`.', '2026-06-07T10:03:00.000Z'),
    obs('cccccccccccc', 'User says SQLITE_BUSY is the blocker and WAL must stay enabled via `PRAGMA journal_mode=WAL`.', '2026-06-07T10:04:00.000Z'),
    obs('dddddddddddd', 'Assistant acknowledged the instruction.', '2026-06-07T10:05:00.000Z'),
  ];
  const { runReflector } = await loadOmAgents();
  const output = await runReflector({ ...auth, reflections: [], observations, thinkingLevel: 'off', maxTurns: 6 });
  return judged('reflector-current-stale-blocker', 'reflector', output ?? [], {
    id: 'reflector-current-stale-blocker',
    question: 'Did the reflector create durable one-line reflections for current/stale decision and unresolved blocker, without reflecting acknowledgement noise?',
    rubric: {
      pass_if: [
        'Output contains a reflection preserving SQLite at /tmp/jobs.db as current and Redis as rejected/stale.',
        'Output contains a reflection preserving the unresolved SQLITE_BUSY blocker at src/db/migrate.ts:88 and WAL/PRAGMA journal_mode=WAL requirement.',
        'Each reflection cites one or more supporting observation ids from aaaaaaaaaaaa, bbbbbbbbbbbb, cccccccccccc, dddddddddddd.',
        'Output does not create a durable reflection merely for assistant acknowledgement.',
      ],
      fail_if: ['Output omits current-vs-stale relationship.', 'Output omits exact error/file or WAL requirement.', 'Output invents support ids.'],
    },
  }, judgeModel, started);
}

async function reflectorReviewedZero(modelSpec: string, judgeModel: string): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Assistant said okay.', '2026-06-07T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'User said thanks.', '2026-06-07T10:01:00.000Z'),
  ];
  const { runReflector } = await loadOmAgents();
  const output = await runReflector({ ...auth, reflections: [ref('eeeeeeeeeeee', 'User prefers concise memory updates.', ['aaaaaaaaaaaa'])], observations, thinkingLevel: 'off', maxTurns: 4 });
  return judged('reflector-reviewed-zero-noise', 'reflector', output ?? [], {
    id: 'reflector-reviewed-zero-noise',
    question: 'Did the reflector correctly add no durable reflections for acknowledgement-only observations?',
    rubric: {
      pass_if: ['Output is empty or otherwise indicates no new durable reflection was recorded.'],
      fail_if: ['Output records a durable reflection for thanks/okay acknowledgement noise.'],
    },
  }, judgeModel, started);
}

async function dropperHardSafety(modelSpec: string, judgeModel: string): Promise<AgentEvalRecord> {
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
  const output = await runDropper({ ...auth, reflections, observations, protectedObservationIds: ['cccccccccccc'], maxDropsAllowed: 2, thinkingLevel: 'off', maxTurns: 4 });
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

async function main() {
  const args = parseArgs();
  fs.mkdirSync(args.outDir, { recursive: true });
  const cases = [observerHardCurrentStale, observerHardAssistantOnly, reflectorHardCompression, reflectorReviewedZero, dropperHardSafety];
  const records: AgentEvalRecord[] = [];
  for (const c of cases) {
    try { records.push(await c(args.model, args.judgeModel)); }
    catch (error) {
      records.push({ id: c.name, agent: c.name.startsWith('observer') ? 'observer' : c.name.startsWith('reflector') ? 'reflector' : 'dropper', output: undefined, passed: false, durationMs: 0, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
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
