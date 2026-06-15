import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { AgentEvalRecord } from '../types.js';
import { createUsageCollector, loadCuratorRunner, loadOmAgents, obs, ref, resolveModel } from '../runner.js';
import { curatorEvalDiagnostics, curatorIds, judgedCuratorScored } from '../diagnostics.js';

export async function curatorFlagsMissingExactDetail(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
  const started = Date.now();
  const auth = await resolveModel(modelSpec);
  const observations = [
    obs('aaaaaaaaaaaa', 'Migration dry run command `pnpm migrate -- --dry-run` failed with exact error `Error: SQLITE_BUSY at src/db/migrate.ts:88`.', '2026-06-07T09:00:00.000Z'),
    obs('bbbbbbbbbbbb', 'User says the SQLITE_BUSY failure remains the current blocker and WAL must stay enabled via `PRAGMA journal_mode=WAL`.', '2026-06-07T09:01:00.000Z'),
  ];
  const reflections = [ref('cccccccccccc', 'Migration dry run failed with a database lock; WAL should stay enabled.', ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])];
  const runCurator = await loadCuratorRunner();
  const usage = createUsageCollector();
  const phaseMetrics: unknown[] = [];
  const agentStarted = Date.now();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 1, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage, onPhase: (metrics: unknown) => phaseMetrics.push(metrics) });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCuratorScored('curator-flags-missing-exact-detail', output, {
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
  ], [
    { label: 'retains/follows up exact blocker detail', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
  ], usage.total, agentDurationMs, curatorEvalDiagnostics({ observations, reflections, phaseMetrics }));
}

export async function curatorContradictoryReflection(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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
  const phaseMetrics: unknown[] = [];
  const agentStarted = Date.now();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 2, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage, onPhase: (metrics: unknown) => phaseMetrics.push(metrics) });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCuratorScored('curator-contradictory-reflection', output, {
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
  ], [
    { label: 'flags/pins contradictory unresolved evidence for repair', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
  ], usage.total, agentDurationMs, curatorEvalDiagnostics({ observations, reflections, phaseMetrics }));
}

export async function curatorHardSchemaStaleNoise(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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
  const phaseMetrics: unknown[] = [];
  const agentStarted = Date.now();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: ['555555555555'], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 4, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage, onPhase: (metrics: unknown) => phaseMetrics.push(metrics) });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCuratorScored('curator-hard-schema-stale-noise', output, {
    id: 'curator-hard-schema-stale-noise',
    question: 'Did the curator preserve exact schema/blocker evidence while cleaning only stale/noisy observations from a mixed historical pool?',
    rubric: {
      pass_if: [
        'The dropped array contains none of these protected ids: aaaaaaaaaaaa, bbbbbbbbbbbb, 111111111111, 222222222222, 555555555555, 666666666666.',
        'The unpinned arrays contain none of these protected ids: aaaaaaaaaaaa, bbbbbbbbbbbb, 111111111111, 222222222222, 555555555555, 666666666666.',
        'The pinned or flagged arrays include at least one exact schema id: aaaaaaaaaaaa or bbbbbbbbbbbb. It is correct for protected evidence to appear in pinned or flagged.',
        'The pinned or flagged arrays include at least one current eval/recall blocker id: 111111111111 or 222222222222. It is correct for protected evidence to appear in pinned or flagged.',
        'Every dropped id is one of these allowed stale/noise ids: cccccccccccc, dddddddddddd, eeeeeeeeeeee, ffffffffffff, 333333333333, 444444444444.'
      ],
      fail_if: [
        'The dropped array contains any protected id listed above.',
        'The unpinned arrays contain any protected id listed above.',
        'Neither exact schema id is pinned or flagged.',
        'Neither current eval/recall blocker id is pinned or flagged.',
        'The judge treats protected ids in pinned or flagged arrays as a failure; pinned and flagged are preservation actions, not loss.',
        'The dropped array contains an id outside the allowed stale/noise set.'
      ],
    },
  }, judgeModel, started, [
    { label: 'must not drop exact schema/current blocker/validation/current config evidence', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', '111111111111', '222222222222', '555555555555', '666666666666'].includes(id)) },
    { label: 'drops must be limited to stale/noise ids', pass: (o) => curatorIds(o, 'dropped').every((id) => ['cccccccccccc', 'dddddddddddd', 'eeeeeeeeeeee', 'ffffffffffff', '333333333333', '444444444444'].includes(id)) },
  ], [
    { label: 'retains exact schema names', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'].includes(id)) },
    { label: 'retains current eval/recall blockers', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['111111111111', '222222222222'].includes(id)) },
  ], usage.total, agentDurationMs, curatorEvalDiagnostics({ observations, reflections, phaseMetrics }));
}



export async function curatorBrutalHistoricalPressure(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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
  const phaseMetrics: unknown[] = [];
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
    onPhase: (metrics: unknown) => phaseMetrics.push(metrics),
  });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCuratorScored('curator-brutal-historical-pressure', output, {
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
        'The dropped array contains any protected current/correction id.',
        'Fewer than two exact schema/correction ids are pinned or flagged.',
        'No current eval/recall/diagnostic blocker id is pinned or flagged.',
        'Neither stale pinned id a00000000015 nor a00000000028 is unpinned.',
        'The dropped array contains an id outside the safe stale/noise set.'
      ],
    },
  }, judgeModel, started, [
    { label: 'must not drop protected current/correction evidence', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['a00000000001', 'a00000000003', 'a00000000005', 'a00000000007', 'a00000000009', 'a00000000011', 'a00000000013', 'a00000000016', 'a00000000017', 'a00000000022', 'a00000000024', 'a00000000025', 'a00000000027', 'a00000000031'].includes(id)) },
    { label: 'drops must be limited to safe stale/noise ids', pass: (o) => curatorIds(o, 'dropped').every((id) => ['a00000000002', 'a00000000004', 'a00000000006', 'a00000000008', 'a00000000010', 'a00000000012', 'a00000000014', 'a00000000018', 'a00000000019', 'a00000000020', 'a00000000021', 'a00000000023', 'a00000000026', 'a00000000029', 'a00000000030', 'a00000000032'].includes(id)) },
  ], [
    { label: 'retains at least two exact schema/correction ids', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].filter((id) => ['a00000000001', 'a00000000005', 'a00000000022', 'a00000000024'].includes(id)).length >= 2 },
    { label: 'retains eval/recall/diagnostic blocker provenance', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['a00000000011', 'a00000000013', 'a00000000031'].includes(id)) },
    { label: 'unpins stale pinned evidence after newer evidence', pass: (o) => curatorIds(o, 'unpinned').some((id) => ['a00000000015', 'a00000000028'].includes(id)) },
  ], usage.total, agentDurationMs, curatorEvalDiagnostics({ observations, reflections, phaseMetrics }));
}



export async function curatorBrutalUnpinTrap(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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
  const phaseMetrics: unknown[] = [];
  const agentStarted = Date.now();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: ['u00000000001', 'u00000000003', 'u00000000006', 'u00000000009'], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 4, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage, onPhase: (metrics: unknown) => phaseMetrics.push(metrics) });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCuratorScored('curator-brutal-unpin-trap', output, {
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
        'u00000000001 is not unpinned.',
        'u00000000003 or u00000000006 is unpinned.',
        'None of u00000000005, u00000000008, u00000000014, or u00000000015 is pinned or flagged.',
        'The dropped array contains any of u00000000005, u00000000008, u00000000013, u00000000014, or u00000000015.',
        'The dropped array contains an id outside this set: u00000000010, u00000000011, u00000000012.'
      ],
    },
  }, judgeModel, started, [
    { label: 'must not unpin current deploy/auth failures', pass: (o) => !curatorIds(o, 'unpinned').some((id) => ['u00000000003', 'u00000000006'].includes(id)) },
    { label: 'must not drop blockers or verification commands', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['u00000000005', 'u00000000008', 'u00000000013', 'u00000000014', 'u00000000015'].includes(id)) },
    { label: 'drops must be limited to stale/noise', pass: (o) => curatorIds(o, 'dropped').every((id) => ['u00000000010', 'u00000000011', 'u00000000012'].includes(id)) },
  ], [
    { label: 'unpins stale parser failure with later passing validation', pass: (o) => curatorIds(o, 'unpinned').includes('u00000000001') },
    { label: 'retains deploy/auth blocker evidence', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['u00000000005', 'u00000000008', 'u00000000014', 'u00000000015'].includes(id)) },
  ], usage.total, agentDurationMs, curatorEvalDiagnostics({ observations, reflections, phaseMetrics }));
}

export async function curatorBrutalContradictoryReflections(modelSpec: string, judgeModel: string, thinkingLevel: ModelThinkingLevel): Promise<AgentEvalRecord> {
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
  const phaseMetrics: unknown[] = [];
  const agentStarted = Date.now();
  const output = await runCurator({ ...auth, reflections, observations, pinnedObservationIds: [], flaggedObservationIds: [], protectedObservationIds: [], maxDropsAllowed: 3, thinkingLevel, maxTurns: 4, onUsage: usage.onUsage, onPhase: (metrics: unknown) => phaseMetrics.push(metrics) });
  const agentDurationMs = Date.now() - agentStarted;
  return judgedCuratorScored('curator-brutal-contradictory-reflections', output, {
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
        'Neither c00000000002 nor c00000000003 is pinned or flagged.',
        'c00000000005 is not pinned or flagged.',
        'Neither c00000000007 nor c00000000013 is pinned or flagged.',
        'Neither c00000000010 nor c00000000011 is pinned or flagged.',
        'The dropped array contains any of c00000000002, c00000000005, c00000000007, c00000000010, c00000000011, or c00000000013.',
        'The dropped array contains an id outside this set: c00000000008, c00000000009, c00000000012.'
      ],
    },
  }, judgeModel, started, [
    { label: 'must not drop corrective/current evidence', pass: (o) => !curatorIds(o, 'dropped').some((id) => ['c00000000002', 'c00000000005', 'c00000000007', 'c00000000010', 'c00000000011', 'c00000000013'].includes(id)) },
    { label: 'drops must be limited to noise/stale ids', pass: (o) => curatorIds(o, 'dropped').every((id) => ['c00000000008', 'c00000000009', 'c00000000012'].includes(id)) },
  ], [
    { label: 'retains feature flag correction', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['c00000000002', 'c00000000003'].includes(id)) },
    { label: 'retains auth failure correction', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].includes('c00000000005') },
    { label: 'retains recall/hard-eval correction', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['c00000000007', 'c00000000013'].includes(id)) },
    { label: 'retains exact schema correction', pass: (o) => [...curatorIds(o, 'pinned'), ...curatorIds(o, 'flagged')].some((id) => ['c00000000010', 'c00000000011'].includes(id)) },
  ], usage.total, agentDurationMs, curatorEvalDiagnostics({ observations, reflections, phaseMetrics }));
}


