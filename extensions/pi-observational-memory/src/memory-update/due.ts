import type { Runtime } from "../runtime.js";
import {
	foldLedger,
	latestReflectionReviewEntryIndex,
	reflectionTokenSum,
	sourceEntryCountSinceObservationCoverage,
	type Entry,
} from "../session-ledger/index.js";
import { observationsSinceReflectionCoverage } from "./stage-utils.js";

export type MemoryStageDue = {
	observerDue: boolean;
	reflectorDue: boolean;
	rewriteDue: boolean;
};

export function computeMemoryStageDue(entries: Entry[], runtime: Runtime): MemoryStageDue {
	const folded = foldLedger(entries, { pendingFlagsAfterIndex: latestReflectionReviewEntryIndex(entries) });
	const unreflectedObservationCount = observationsSinceReflectionCoverage(entries, folded.activeObservations).length;
	const flaggedActiveObservationCount = folded.activeObservations.filter((observation) => folded.flaggedObservationIds.has(observation.id)).length;
	const reflectionWorkCount = unreflectedObservationCount + flaggedActiveObservationCount;
	return {
		observerDue: sourceEntryCountSinceObservationCoverage(entries) >= runtime.config.observeEveryMessages,
		reflectorDue: reflectionWorkCount >= runtime.config.reflectEveryObservations,
		rewriteDue: reflectionTokenSum(folded.reflections) >= runtime.config.reflectionsPoolMaxTokens,
	};
}
