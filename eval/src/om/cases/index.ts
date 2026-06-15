import { observerExactLanguageFutureIntent, observerRealGiga32, observerRealGiga64, observerRealGiga96, observerStateStaleBlocker, observerToolEvidenceBoundary, observerZeroDurableRestraint } from './observer.js';
import { reflectorExactAnchorRetention, reflectorRealGiga8, reflectorRealGiga16, reflectorRealSessionConstraintsAndState, reflectorRestraintAlreadyCovered, reflectorStaleCurrentReconciliation, reflectorSupersessionRelation } from './reflector.js';
import { rewriteDeferredTaskRetention, rewriteOmMigrationCompression, rewriteRealGiga40, rewriteRealGiga80, rewriteRealGiga120, rewriteStaleRelationshipPreservation, rewriteUserConstraintsBundle, rewriteValidationStatusConsolidation } from './rewrite.js';

(observerRealGiga96 as any).suite = 'stress';
(rewriteRealGiga120 as any).suite = 'stress';

export const allCases = [
  observerStateStaleBlocker,
  observerToolEvidenceBoundary,
  observerExactLanguageFutureIntent,
  observerRealGiga32,
  observerRealGiga64,
  observerZeroDurableRestraint,
  reflectorStaleCurrentReconciliation,
  reflectorExactAnchorRetention,
  reflectorSupersessionRelation,
  reflectorRestraintAlreadyCovered,
  reflectorRealGiga8,
  reflectorRealGiga16,
  reflectorRealSessionConstraintsAndState,
  rewriteOmMigrationCompression,
  rewriteStaleRelationshipPreservation,
  rewriteValidationStatusConsolidation,
  rewriteUserConstraintsBundle,
  rewriteRealGiga40,
  rewriteRealGiga80,
  rewriteDeferredTaskRetention,
  observerRealGiga96,
  rewriteRealGiga120,
];
