import type { RecallUseCase } from '../types.js';

const VALIDATION_COMMAND = 'cd extensions/pi-observational-memory && pnpm run typecheck && pnpm test';

export const cases: RecallUseCase[] = [
  {
    id: 'recall-exact-command-from-known-ref',
    prompt: 'Compacted memory ref_222222222222 says there is a required validation command for the OM recall refactor, but not the exact command. What exact command should I run?',
    expectedCalls: [{ id: 'ref_222222222222' }],
    mockResults: {
      ref_222222222222: `Reflections:\n[ref_222222222222] A compacted OM memory contains the required validation command for the recall refactor.\n\nProvenance:\nref_222222222222 -> obs_111111111111\n\nObservations:\n[obs_111111111111] User confirmed the required OM recall-refactor validation command is \`${VALIDATION_COMMAND}\`.`,
    },
    requiredAnswerText: [VALIDATION_COMMAND],
  },
  {
    id: 'recall-stale-current-conflict',
    prompt: 'Compacted memories ref_666666666666 and ref_777777777777 disagree about the recall-use eval retry budget, but their exact values are hidden behind recall. What is the current retry budget, and which value is stale?',
    expectedCalls: [{ id: 'ref_666666666666' }, { id: 'ref_777777777777' }],
    mockResults: {
      ref_666666666666: 'Reflections:\n[ref_666666666666] Earlier retry-budget value for recall-use evals.\n\nObservations:\n[obs_444444444444] Earlier plan: the retry budget for recall-use evals was 2 attempts.',
      ref_777777777777: 'Reflections:\n[ref_777777777777] Current retry-budget correction for recall-use evals.\n\nObservations:\n[obs_555555555555] User corrected the recall-use eval retry budget: current value is 5 attempts, and the earlier value 2 is stale.',
    },
    requiredAnswerText: ['5', '2', 'stale'],
  },
  {
    id: 'recall-broad-ref-provenance-needs-intermediate',
    prompt: 'Compacted memory ref_aaaaaaaaaaaa is a broad reflection with nested provenance. I need the exact intermediate rationale too, not just terminal observations. What supports it?',
    expectedCalls: [{ id: 'ref_aaaaaaaaaaaa', includeIntermediate: true }],
    mockResults: {
      ref_aaaaaaaaaaaa: 'Reflections:\n[ref_aaaaaaaaaaaa] Current plan is to keep rewrite deferred and harden maintainer first.\n\nProvenance:\nref_aaaaaaaaaaaa -> ref_bbbbbbbbbbbb\nref_bbbbbbbbbbbb -> obs_cccccccccccc\n\nSupporting reflections:\n[ref_bbbbbbbbbbbb] Maintainer evals are now green after contract hardening.\n\nObservations:\n[obs_cccccccccccc] Maintainer evals passed 30/30 trials=3 after commit 93048e1.',
    },
    requiredAnswerText: ['maintainer', '30/30', '93048e1'],
  },
  {
    id: 'recall-partial-evidence-reports-uncertainty',
    prompt: 'Memory ref_dddddddddddd matters for a decision, but it may have partial or missing evidence. Recall it and tell me what is known and what is unavailable.',
    expectedCalls: [{ id: 'ref_dddddddddddd' }],
    mockResults: {
      ref_dddddddddddd: 'Reflections:\n[ref_dddddddddddd] A prior decision depends on an unavailable supporting observation.\n\nProvenance:\nref_dddddddddddd -> obs_eeeeeeeeeeee\n\nUnavailable supporting observations: obs_eeeeeeeeeeee\nUnavailable source entries: missing: src-lost',
    },
    requiredAnswerText: ['unavailable', 'obs_eeeeeeeeeeee'],
  },
  {
    id: 'recall-not-semantic-search',
    prompt: 'Use recall to find any memory about validation commands. I do not have a memory id.',
    expectedCalls: [],
    forbiddenAnswerText: [VALIDATION_COMMAND],
  },
  {
    id: 'recall-not-needed-for-conceptual-guidance',
    prompt: 'Conceptually, why should recall not be used as semantic search? Do not look up any memory id.',
    expectedCalls: [],
  },
];
