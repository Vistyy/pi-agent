import type { OmEvalCase } from '../types.js';
import { observerAssistantProseBoundary, observerHiddenMutationPayloadBoundary, observerHiddenMutationReplacementEvidence, observerRealGiga32, observerRealGiga64v2, observerToolEvidenceBoundary } from './observer.js';
import { reflectorAppendNewCompatibleFact, reflectorChurnFilter, reflectorDuplicateObservationNoop, reflectorFalseStalePrevention, reflectorGigaAppendNewFact, reflectorGigaDuplicateNoop, reflectorGigaStaleCorrection, reflectorRealGiga16v2, reflectorRealSessionConstraintsAndState, reflectorStaleCurrentReconciliation, reflectorSubtleStaleCorrection, reflectorTouchedFilesWeakContext } from './reflector.js';
import { rewriteRealGiga40v2, rewriteRealGiga80, rewriteStaleRelationshipPreservation } from './rewrite.js';

const omCase = (id: string, agent: OmEvalCase['agent'], run: OmEvalCase['run'], suite: OmEvalCase['suite'] = 'baseline'): OmEvalCase => ({ id, agent, run, suite });

export const allCases: OmEvalCase[] = [
  omCase('observer-tool-evidence-boundary', 'observer', observerToolEvidenceBoundary),
  omCase('observer-hidden-mutation-payload-boundary', 'observer', observerHiddenMutationPayloadBoundary),
  omCase('observer-hidden-mutation-replacement-evidence', 'observer', observerHiddenMutationReplacementEvidence),
  omCase('observer-assistant-prose-boundary', 'observer', observerAssistantProseBoundary),
  omCase('observer-real-giga-32', 'observer', observerRealGiga32),
  omCase('observer-real-giga-64-v2', 'observer', observerRealGiga64v2),
  omCase('reflector-touched-files-weak-context', 'reflector', reflectorTouchedFilesWeakContext),
  omCase('reflector-duplicate-observation-noop', 'reflector', reflectorDuplicateObservationNoop),
  omCase('reflector-append-new-compatible-fact', 'reflector', reflectorAppendNewCompatibleFact),
  omCase('reflector-stale-current-reconciliation', 'reflector', reflectorStaleCurrentReconciliation),
  omCase('reflector-subtle-stale-correction', 'reflector', reflectorSubtleStaleCorrection),
  omCase('reflector-false-stale-prevention', 'reflector', reflectorFalseStalePrevention),
  omCase('reflector-churn-filter', 'reflector', reflectorChurnFilter),
  omCase('reflector-real-giga-16-v2', 'reflector', reflectorRealGiga16v2),
  omCase('reflector-giga-duplicate-noop', 'reflector', reflectorGigaDuplicateNoop),
  omCase('reflector-giga-append-new-fact', 'reflector', reflectorGigaAppendNewFact),
  omCase('reflector-giga-stale-correction', 'reflector', reflectorGigaStaleCorrection),
  omCase('reflector-real-session-constraints-and-state', 'reflector', reflectorRealSessionConstraintsAndState),
  omCase('rewrite-stale-relationship-preservation', 'rewrite', rewriteStaleRelationshipPreservation),
  omCase('rewrite-real-giga-40-v2', 'rewrite', rewriteRealGiga40v2),
  omCase('rewrite-real-giga-80', 'rewrite', rewriteRealGiga80),
];
