import type { OmEvalCase } from '../types.js';
import { observerHiddenMutationPayloadBoundary, observerRealGiga32, observerRealGiga64v2, observerToolEvidenceBoundary } from './observer.js';
import { reflectorRealGiga16v2, reflectorRealSessionConstraintsAndState, reflectorStaleCurrentReconciliation, reflectorTouchedFilesWeakContext } from './reflector.js';
import { rewriteRealGiga40v2, rewriteRealGiga80, rewriteStaleRelationshipPreservation } from './rewrite.js';

const omCase = (id: string, agent: OmEvalCase['agent'], run: OmEvalCase['run'], suite: OmEvalCase['suite'] = 'baseline'): OmEvalCase => ({ id, agent, run, suite });

export const allCases: OmEvalCase[] = [
  omCase('observer-tool-evidence-boundary', 'observer', observerToolEvidenceBoundary),
  omCase('observer-hidden-mutation-payload-boundary', 'observer', observerHiddenMutationPayloadBoundary),
  omCase('observer-real-giga-32', 'observer', observerRealGiga32),
  omCase('observer-real-giga-64-v2', 'observer', observerRealGiga64v2),
  omCase('reflector-touched-files-weak-context', 'reflector', reflectorTouchedFilesWeakContext),
  omCase('reflector-stale-current-reconciliation', 'reflector', reflectorStaleCurrentReconciliation),
  omCase('reflector-real-giga-16-v2', 'reflector', reflectorRealGiga16v2),
  omCase('reflector-real-session-constraints-and-state', 'reflector', reflectorRealSessionConstraintsAndState),
  omCase('rewrite-stale-relationship-preservation', 'rewrite', rewriteStaleRelationshipPreservation),
  omCase('rewrite-real-giga-40-v2', 'rewrite', rewriteRealGiga40v2),
  omCase('rewrite-real-giga-80', 'rewrite', rewriteRealGiga80),
];
