import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord } from '../types.js';
import { createUsageCollector, loadOmAgents, obs, ref, resolveModel } from '../runner.js';
import { judged, judgedReflectorScored, reflectorForbidsAny, reflectorMaxCount, reflectorRequiresAll, reflectorSourceIdsAllowed } from '../diagnostics.js';

export async function reflectorHardCompression(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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
        'Each reflection has a sources array containing only these exact valid observation ids: obs_aaaaaaaaaaaa, obs_bbbbbbbbbbbb, obs_cccccccccccc, obs_dddddddddddd.',
        'Output does not create a durable reflection merely for assistant acknowledgement.',
      ],
      fail_if: ['Output omits current-vs-stale relationship.', 'Output omits exact error/file or WAL requirement.', 'Any sources value is not one of: obs_aaaaaaaaaaaa, obs_bbbbbbbbbbbb, obs_cccccccccccc, obs_dddddddddddd.'],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
}

export async function reflectorSupersessionRelation(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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
        'The reflection cites source observation id obs_aaaaaaaaaaaa and may cite obs_bbbbbbbbbbbb or obs_cccccccccccc.',
      ],
      fail_if: [
        'Output omits the supersedes/replaces relationship between fast_sync_v2_enabled and enableFastSync.',
        'Output treats enableFastSync as current or ambiguous.',
        'Output invents support ids.',
      ],
    },
  }, judgeModel, started, usage.total, agentDurationMs);
}

export async function reflectorReviewedZero(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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


async function runReflectorCase(modelSpec: string, thinkingLevel: ModelThinkingLevel, args: Record<string, unknown>) {
  const auth = await resolveModel(modelSpec);
  const { runReflector } = await loadOmAgents();
  const usage = createUsageCollector();
  const agentStarted = Date.now();
  const output = await runReflector({ ...auth, ...args, thinkingLevel, maxTurns: 6, onUsage: usage.onUsage });
  return { output, usage, agentDurationMs: Date.now() - agentStarted };
}

export async function reflectorHardRepairFlag(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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
        'Output cites source observation id obs_aaaaaaaaaaaa.',
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


export async function reflectorRetractsNoLongerTrue(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const observations = [
    obs('aaaaaaaaaaaa', 'Previous decision `apiMode=legacy` is no longer true; current decision is `apiMode=streaming`.', '2026-06-12T10:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Do not use the legacy API mode in new code; it was rejected after the streaming rollout passed validation.', '2026-06-12T10:01:00.000Z'),
  ];
  const reflections = [ref('eeeeeeeeeeee', 'apiMode=legacy is the current API mode.', ['aaaaaaaaaaaa'])];
  const { output, usage, agentDurationMs } = await runReflectorCase(modelSpec, thinkingLevel, { reflections, observations });
  return judgedReflectorScored('reflector-retracts-no-longer-true', output, {
    id: 'reflector-retracts-no-longer-true',
    question: 'Did the reflector avoid reinforcing stale active memory and record the current replacement when new evidence says an old reflection is no longer true?',
    rubric: {
      pass_if: ['Output does not add a reflection claiming apiMode=legacy is current.', 'Output preferably adds a corrective reflection that apiMode=streaming is current and legacy is rejected.'],
      fail_if: ['Output repeats or reinforces apiMode=legacy as current.', 'Output ignores the replacement relationship entirely.'],
    },
  }, judgeModel, started, [reflectorForbidsAny('apiMode=legacy is the current')], [reflectorRequiresAll('apiMode=streaming'), reflectorSourceIdsAllowed(observations.map((observation) => observation.id))], usage.total, agentDurationMs, { observations, reflections });
}

export async function reflectorExactAnchorSurvivesNoise(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const observations = [
    obs('aaaaaaaaaaaa', 'Exact deploy command that passed is `pnpm --filter api deploy --env=prod --dry-run`.', '2026-06-12T11:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'Several later notes loosely call it the prod deploy dry run command without exact flags.', '2026-06-12T11:01:00.000Z'),
    obs('cccccccccccc', 'Assistant paraphrased the deploy check as successful.', '2026-06-12T11:02:00.000Z'),
  ];
  const { output, usage, agentDurationMs } = await runReflectorCase(modelSpec, thinkingLevel, { reflections: [], observations });
  return judgedReflectorScored('reflector-exact-anchor-survives-noise', output, {
    id: 'reflector-exact-anchor-survives-noise',
    question: 'Did the reflector retain the exact command anchor instead of only paraphrasing noisy near-duplicates?',
    rubric: {
      pass_if: ['Output preserves `pnpm --filter api deploy --env=prod --dry-run` exactly.', 'Output does not replace the exact command with only a vague paraphrase.'],
      fail_if: ['Output omits the exact command or changes its flags.', 'Output reflects only generic deploy success noise.'],
    },
  }, judgeModel, started, [reflectorSourceIdsAllowed(observations.map((observation) => observation.id))], [reflectorRequiresAll('pnpm --filter api deploy --env=prod --dry-run'), reflectorMaxCount(3)], usage.total, agentDurationMs, { observations });
}

export async function reflectorFlagAlreadyCoveredDoesNotLoop(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const observations = [obs('aaaaaaaaaaaa', 'Current config file is `/etc/pi/om.json`; the key is `reflectorThinking` and default is `low`.', '2026-06-12T12:00:00.000Z')];
  const reflections = [ref('eeeeeeeeeeee', 'Current OM config file is /etc/pi/om.json; reflectorThinking default is low.', ['aaaaaaaaaaaa'])];
  const { output, usage, agentDurationMs } = await runReflectorCase(modelSpec, thinkingLevel, {
    reflections,
    observations,
    flaggedObservations: [{ observation: observations[0], reasons: ['Check exact path/key/default coverage.'] }],
  });
  return judgedReflectorScored('reflector-flag-already-covered-does-not-loop', output, {
    id: 'reflector-flag-already-covered-does-not-loop',
    question: 'Did the reflector avoid duplicating an already-covered flagged observation?',
    rubric: {
      pass_if: ['Output is empty or adds at most one genuinely corrective reflection.', 'Output does not duplicate the existing reflection.'],
      fail_if: ['Output adds duplicate or noisy follow-up reflections for already-covered evidence.'],
    },
  }, judgeModel, started, [reflectorMaxCount(1), reflectorSourceIdsAllowed(observations.map((observation) => observation.id))], [], usage.total, agentDurationMs, { observations, reflections, flaggedObservationIds: [observations[0].id] });
}
