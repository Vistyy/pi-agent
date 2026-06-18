import type { OmEvalCase } from '../types.js';
import { e2eObserverReflectorRewriteRecall } from './e2e.js';
import { observerExactLanguageFutureIntent, observerRealGiga32, observerRealGiga64, observerRealGiga64v2, observerRealGiga96, observerStateStaleBlocker, observerToolEvidenceBoundary, observerZeroDurableRestraint } from './observer.js';
import { reflectorExactAnchorRetention, reflectorRealGiga8, reflectorRealGiga16, reflectorRealGiga16v2, reflectorRealSessionConstraintsAndState, reflectorRestraintAlreadyCovered, reflectorRoutineValidationRestraint, reflectorStaleCurrentReconciliation, reflectorSupersessionRelation } from './reflector.js';
import { recallActiveObservation, recallNotFound, recallPartialMissingSource, recallReflectionChain, recallRetiredReflectionDirectly, recallThroughRetiredReflection } from './recall.js';
import { rewriteDeferredTaskRetention, rewriteOmMigrationCompression, rewriteRealGiga40, rewriteRealGiga40v2, rewriteRealGiga80, rewriteRealGiga120, rewriteStaleRelationshipPreservation, rewriteUserConstraintsBundle, rewriteValidationStatusConsolidation } from './rewrite.js';

function omCase(id: string, agent: OmEvalCase['agent'], run: OmEvalCase['run'], suite: OmEvalCase['suite'] = 'baseline'): OmEvalCase {
  return { id, agent, run, suite };
}

export const allCases: OmEvalCase[] = [
  omCase('observer-state-stale-blocker', 'observer', observerStateStaleBlocker),
  omCase('observer-tool-evidence-boundary', 'observer', observerToolEvidenceBoundary),
  omCase('observer-exact-language-future-intent', 'observer', observerExactLanguageFutureIntent),
  omCase('observer-real-giga-32', 'observer', observerRealGiga32),
  omCase('observer-real-giga-64', 'observer', observerRealGiga64),
  omCase('observer-real-giga-64-v2', 'observer', observerRealGiga64v2),
  omCase('observer-zero-durable-restraint', 'observer', observerZeroDurableRestraint),
  omCase('reflector-stale-current-reconciliation', 'reflector', reflectorStaleCurrentReconciliation),
  omCase('reflector-exact-anchor-retention', 'reflector', reflectorExactAnchorRetention),
  omCase('reflector-supersession-relation', 'reflector', reflectorSupersessionRelation),
  omCase('reflector-restraint-already-covered', 'reflector', reflectorRestraintAlreadyCovered),
  omCase('reflector-routine-validation-restraint', 'reflector', reflectorRoutineValidationRestraint),
  omCase('reflector-real-giga-8', 'reflector', reflectorRealGiga8),
  omCase('reflector-real-giga-16', 'reflector', reflectorRealGiga16),
  omCase('reflector-real-giga-16-v2', 'reflector', reflectorRealGiga16v2),
  omCase('reflector-real-session-constraints-and-state', 'reflector', reflectorRealSessionConstraintsAndState),
  omCase('rewrite-om-migration-compression', 'rewrite', rewriteOmMigrationCompression),
  omCase('rewrite-stale-relationship-preservation', 'rewrite', rewriteStaleRelationshipPreservation),
  omCase('rewrite-validation-status-consolidation', 'rewrite', rewriteValidationStatusConsolidation),
  omCase('rewrite-user-constraints-bundle', 'rewrite', rewriteUserConstraintsBundle),
  omCase('rewrite-real-giga-40', 'rewrite', rewriteRealGiga40),
  omCase('rewrite-real-giga-80', 'rewrite', rewriteRealGiga80),
  omCase('rewrite-real-giga-40-v2', 'rewrite', rewriteRealGiga40v2),
  omCase('rewrite-deferred-task-retention', 'rewrite', rewriteDeferredTaskRetention),
  omCase('recall-active-observation', 'recall', recallActiveObservation),
  omCase('recall-reflection-chain', 'recall', recallReflectionChain),
  omCase('recall-through-retired-reflection', 'recall', recallThroughRetiredReflection),
  omCase('recall-retired-reflection-directly', 'recall', recallRetiredReflectionDirectly),
  omCase('recall-partial-missing-source', 'recall', recallPartialMissingSource),
  omCase('recall-not-found', 'recall', recallNotFound),
  omCase('e2e-observer-reflector-rewrite-recall', 'e2e', e2eObserverReflectorRewriteRecall, 'stress'),
  omCase('observer-real-giga-96', 'observer', observerRealGiga96, 'stress'),
  omCase('rewrite-real-giga-120', 'rewrite', rewriteRealGiga120, 'stress'),
];
