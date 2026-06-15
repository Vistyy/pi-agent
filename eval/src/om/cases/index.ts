import { observerHardFutureIntent, observerHardSchemaMess, observerHardSessionCorrectionNoise, observerHardSessionIntentProvenance, observerHardStateStaleBlocker, observerHardStateVsProvenance, observerHardToolEvidenceBoundary } from './observer.js';
import { reflectorExactAnchorSurvivesNoise, reflectorFlagAlreadyCoveredDoesNotLoop, reflectorHardCompression, reflectorHardRepairFlag, reflectorRetractsNoLongerTrue, reflectorReviewedZero, reflectorSupersessionRelation } from './reflector.js';

export const allCases = [
  observerHardStateStaleBlocker,
  reflectorHardCompression,
  reflectorSupersessionRelation,
  reflectorReviewedZero,
  observerHardSchemaMess,
  observerHardToolEvidenceBoundary,
  observerHardStateVsProvenance,
  observerHardFutureIntent,
  observerHardSessionCorrectionNoise,
  observerHardSessionIntentProvenance,
  reflectorHardRepairFlag,
  reflectorRetractsNoLongerTrue,
  reflectorExactAnchorSurvivesNoise,
  reflectorFlagAlreadyCoveredDoesNotLoop,
];
