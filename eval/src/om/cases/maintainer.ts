import type { Probe } from '../../lib/types.js';
import type { MaintenanceResult, OmEvalSuite, OmGrader, Reflection } from '../types.js';
import { maintenanceEveryRetiredRefCovered, maintenanceForbidsAny, maintenanceMaxNewReflections, maintenanceMaxRetiredRefs, maintenanceNoop, maintenanceRequiresAll, maintenanceRequiresAny, maintenanceRetireIdsAllowed, maintenanceSourceIdsAllowed, maintenanceSourcesAreDirectRefs, optional } from '../diagnostics.js';
import { ref } from '../runner.js';

export type MaintainerEvalSpec = {
  id: string;
  suite: OmEvalSuite;
  reflections: Reflection[];
  probe: Probe;
  graders: OmGrader<MaintenanceResult>[];
};

const localReplacementGuards = (reflections: Reflection[]): OmGrader<MaintenanceResult>[] => {
  const ids = reflections.map((reflection) => reflection.id);
  return [
    maintenanceRetireIdsAllowed(ids),
    maintenanceSourceIdsAllowed(ids),
    maintenanceSourcesAreDirectRefs(),
    maintenanceEveryRetiredRefCovered(),
    maintenanceMaxRetiredRefs(4),
    maintenanceMaxNewReflections(2),
  ];
};

export const maintainerDuplicateMerge: MaintainerEvalSpec = {
  id: 'maintainer-duplicate-merge',
  suite: 'baseline',
  reflections: [
    ref('100000000001', 'Use `pnpm` instead of `npm` for this repository.', ['obs_aaaaaaaaaaaa']),
    ref('100000000002', 'Project commands should use pnpm, not npm.', ['obs_bbbbbbbbbbbb']),
    ref('100000000003', 'Compaction must not run memory agents synchronously.', ['obs_cccccccccccc']),
  ],
  probe: {
    id: 'maintainer-duplicate-merge',
    question: 'Merge only the duplicate package-manager reflections and preserve direct-parent provenance.',
    rubric: {
      pass_if: ['Retires only duplicate input refs.', 'Emits one replacement that preserves pnpm-over-npm behavior.', 'Replacement sources cite the retired ref_* parents, not obs_* ancestors.'],
      fail_if: ['Retires the unrelated compaction reflection.', 'Copies obs_* ancestry into the replacement.', 'Leaves duplicate package-manager refs unmerged.'],
    },
  },
  graders: [
    ...localReplacementGuards([
      ref('100000000001', 'Use `pnpm` instead of `npm` for this repository.', ['obs_aaaaaaaaaaaa']),
      ref('100000000002', 'Project commands should use pnpm, not npm.', ['obs_bbbbbbbbbbbb']),
      ref('100000000003', 'Compaction must not run memory agents synchronously.', ['obs_cccccccccccc']),
    ]),
    maintenanceRequiresAll('pnpm'),
    maintenanceForbidsAny('obs_aaaaaaaaaaaa', 'obs_bbbbbbbbbbbb'),
  ],
};

export const maintainerStaleCurrentPair: MaintainerEvalSpec = {
  id: 'maintainer-stale-current-pair',
  suite: 'baseline',
  reflections: [
    ref('200000000001', 'Old preference: generate API clients with `toolkit-v1`.', ['obs_aaaaaaaaaaaa']),
    ref('200000000002', 'Current preference: `toolkit-v2` replaced `toolkit-v1` for API client generation.', ['obs_bbbbbbbbbbbb']),
    ref('200000000003', 'Use short direct answers unless the user asks for detail.', ['obs_cccccccccccc']),
  ],
  probe: {
    id: 'maintainer-stale-current-pair',
    question: 'Combine the local stale/current pair without disturbing unrelated active memory.',
    rubric: {
      pass_if: ['Retires only the stale/current pair.', 'Emits a replacement that makes toolkit-v2 current and toolkit-v1 stale/replaced.', 'Uses direct ref_* parents as sources.'],
      fail_if: ['Keeps toolkit-v1 as current.', 'Retires the unrelated response-style preference.', 'Drops the stale/current relationship.'],
    },
  },
  graders: [
    ...localReplacementGuards([
      ref('200000000001', 'Old preference: generate API clients with `toolkit-v1`.', ['obs_aaaaaaaaaaaa']),
      ref('200000000002', 'Current preference: `toolkit-v2` replaced `toolkit-v1` for API client generation.', ['obs_bbbbbbbbbbbb']),
      ref('200000000003', 'Use short direct answers unless the user asks for detail.', ['obs_cccccccccccc']),
    ]),
    maintenanceRequiresAll('toolkit-v2'),
    maintenanceRequiresAny('stale', 'replaced', 'superseded', 'no longer'),
  ],
};

export const maintainerCompletedTrailCompression: MaintainerEvalSpec = {
  id: 'maintainer-completed-trail-compression',
  suite: 'baseline',
  reflections: [
    ref('300000000001', 'Migration step 1 added typed ids to data records.', ['obs_aaaaaaaaaaaa']),
    ref('300000000002', 'Migration step 2 updated recall traversal for typed ids.', ['obs_bbbbbbbbbbbb']),
    ref('300000000003', 'The typed-id migration is complete and validation passed with the required package commands.', ['obs_cccccccccccc']),
    ref('300000000004', 'A later cost investigation remains deferred.', ['obs_dddddddddddd']),
  ],
  probe: {
    id: 'maintainer-completed-trail-compression',
    question: 'Compress completed local implementation trail into a durable current outcome.',
    rubric: {
      pass_if: ['Replaces step-by-step trail with a current completed outcome.', 'Keeps meaningful validation state.', 'Does not retire the unrelated deferred-task reflection.'],
      fail_if: ['Keeps only procedural step breadcrumbs.', 'Drops the completed/validated status.', 'Retires unrelated deferred work.'],
    },
  },
  graders: [
    ...localReplacementGuards([
      ref('300000000001', 'Migration step 1 added typed ids to data records.', ['obs_aaaaaaaaaaaa']),
      ref('300000000002', 'Migration step 2 updated recall traversal for typed ids.', ['obs_bbbbbbbbbbbb']),
      ref('300000000003', 'The typed-id migration is complete and validation passed with the required package commands.', ['obs_cccccccccccc']),
      ref('300000000004', 'A later cost investigation remains deferred.', ['obs_dddddddddddd']),
    ]),
    maintenanceRequiresAny('complete', 'current'),
    maintenanceRequiresAny('validation', 'passed'),
    optional(maintenanceMaxNewReflections(1)),
  ],
};

export const maintainerUnrelatedNoop: MaintainerEvalSpec = {
  id: 'maintainer-unrelated-noop',
  suite: 'baseline',
  reflections: [
    ref('400000000001', 'Use `pnpm` instead of `npm` for this repository.', ['obs_aaaaaaaaaaaa']),
    ref('400000000002', 'Compaction must not run memory agents synchronously.', ['obs_bbbbbbbbbbbb']),
    ref('400000000003', 'Recall exact ids before relying on memory for exact commands or errors.', ['obs_cccccccccccc']),
  ],
  probe: {
    id: 'maintainer-unrelated-noop',
    question: 'Return no-op when a small cluster has no safe local merge or replacement.',
    rubric: {
      pass_if: ['No retire ids.', 'No replacement reflections.'],
      fail_if: ['Forces unrelated facts into a vague summary.', 'Retires any active reflection.'],
    },
  },
  graders: [maintenanceNoop()],
};

export const maintainerDirectParentProvenance: MaintainerEvalSpec = {
  id: 'maintainer-direct-parent-provenance',
  suite: 'baseline',
  reflections: [
    ref('500000000001', 'Retry policy uses one bounded provider retry for temporary provider errors.', ['obs_aaaaaaaaaaaa', 'obs_bbbbbbbbbbbb']),
    ref('500000000002', 'Provider errors surface as distinct MemoryAgentProviderError failures after retries exhaust.', ['obs_cccccccccccc']),
  ],
  probe: {
    id: 'maintainer-direct-parent-provenance',
    question: 'When merging refs with obs ancestry, cite only direct ref_* parents in the replacement.',
    rubric: {
      pass_if: ['Replacement sources are the retired ref_* parents.', 'No obs_* transitive ancestry is copied into the replacement.', 'The merged content preserves retry and provider-error behavior.'],
      fail_if: ['Sources include obs_* ids copied from parent refs.', 'Drops either retry behavior or distinct provider-error behavior.'],
    },
  },
  graders: [
    ...localReplacementGuards([
      ref('500000000001', 'Retry policy uses one bounded provider retry for temporary provider errors.', ['obs_aaaaaaaaaaaa', 'obs_bbbbbbbbbbbb']),
      ref('500000000002', 'Provider errors surface as distinct MemoryAgentProviderError failures after retries exhaust.', ['obs_cccccccccccc']),
    ]),
    maintenanceRequiresAny('retry', 'retries'),
    maintenanceRequiresAny('ProviderError', 'provider error'),
  ],
};

export const maintainerBlastRadiusGuard: MaintainerEvalSpec = {
  id: 'maintainer-blast-radius-guard',
  suite: 'baseline',
  reflections: [
    ref('600000000001', 'Status command should report maintainer pressure when the active memory budget is high.', ['obs_aaaaaaaaaaaa']),
    ref('600000000002', 'Status command should avoid exposing raw observations in normal active memory output.', ['obs_bbbbbbbbbbbb']),
  ],
  probe: {
    id: 'maintainer-blast-radius-guard',
    question: 'Never retire or source refs outside the bounded maintainer input cluster.',
    rubric: {
      pass_if: ['Any retire ids are limited to the supplied cluster.', 'Any replacement sources are limited to supplied cluster refs.'],
      fail_if: ['Retires an id not present in input.', 'Uses a source id not present in input.'],
    },
  },
  graders: [
    maintenanceRetireIdsAllowed(['ref_600000000001', 'ref_600000000002']),
    maintenanceSourceIdsAllowed(['ref_600000000001', 'ref_600000000002']),
    maintenanceSourcesAreDirectRefs(),
    maintenanceMaxRetiredRefs(4),
    maintenanceMaxNewReflections(2),
  ],
};

export const maintainerEvalSpecs: MaintainerEvalSpec[] = [
  maintainerDuplicateMerge,
  maintainerStaleCurrentPair,
  maintainerCompletedTrailCompression,
  maintainerUnrelatedNoop,
  maintainerDirectParentProvenance,
  maintainerBlastRadiusGuard,
];
