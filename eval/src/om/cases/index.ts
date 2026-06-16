import { e2eObserverReflectorRewriteRecall } from './e2e.js';
import { observerExactLanguageFutureIntent, observerRealGiga32, observerRealGiga64, observerRealGiga64v2, observerRealGiga96, observerStateStaleBlocker, observerToolEvidenceBoundary, observerZeroDurableRestraint } from './observer.js';
import { reflectorExactAnchorRetention, reflectorRealGiga8, reflectorRealGiga16, reflectorRealGiga16v2, reflectorRealSessionConstraintsAndState, reflectorRestraintAlreadyCovered, reflectorStaleCurrentReconciliation, reflectorSupersessionRelation } from './reflector.js';
import { recallActiveObservation, recallNotFound, recallPartialMissingSource, recallReflectionChain, recallRetiredReflectionDirectly, recallThroughRetiredReflection } from './recall.js';
import { rewriteDeferredTaskRetention, rewriteOmMigrationCompression, rewriteRealGiga40, rewriteRealGiga40v2, rewriteRealGiga80, rewriteRealGiga120, rewriteStaleRelationshipPreservation, rewriteUserConstraintsBundle, rewriteValidationStatusConsolidation } from './rewrite.js';

(observerRealGiga96 as any).suite = 'stress';
(rewriteRealGiga120 as any).suite = 'stress';
(e2eObserverReflectorRewriteRecall as any).suite = 'stress';

export const allCases = [
  observerStateStaleBlocker,
  observerToolEvidenceBoundary,
  observerExactLanguageFutureIntent,
  observerRealGiga32,
  observerRealGiga64,
  observerRealGiga64v2,
  observerZeroDurableRestraint,
  reflectorStaleCurrentReconciliation,
  reflectorExactAnchorRetention,
  reflectorSupersessionRelation,
  reflectorRestraintAlreadyCovered,
  reflectorRealGiga8,
  reflectorRealGiga16,
  reflectorRealGiga16v2,
  reflectorRealSessionConstraintsAndState,
  rewriteOmMigrationCompression,
  rewriteStaleRelationshipPreservation,
  rewriteValidationStatusConsolidation,
  rewriteUserConstraintsBundle,
  rewriteRealGiga40,
  rewriteRealGiga80,
  rewriteRealGiga40v2,
  rewriteDeferredTaskRetention,
  recallActiveObservation,
  recallReflectionChain,
  recallThroughRetiredReflection,
  recallRetiredReflectionDirectly,
  recallPartialMissingSource,
  recallNotFound,
  e2eObserverReflectorRewriteRecall,
  observerRealGiga96,
  rewriteRealGiga120,
];
