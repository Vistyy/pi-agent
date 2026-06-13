import type { Runtime } from "../runtime.js";
import {
	foldLedger,
	fullProjection,
	latestReflectionReviewEntryIndex,
	nextContextProjection,
	sourceEntryCountSinceObservationCoverage,
	type Entry,
} from "../session-ledger/index.js";
import { observationsSinceReflectionCoverage } from "./stage-utils.js";

export type MemoryStageDue = {
	observerDue: boolean;
	reflectorDue: boolean;
	curatorEmergencyDue: boolean;
};

export function computeMemoryStageDue(entries: Entry[], runtime: Runtime): MemoryStageDue {
	const folded = foldLedger(entries, { pendingFlagsAfterIndex: latestReflectionReviewEntryIndex(entries) });
	const unreflectedObservationCount = observationsSinceReflectionCoverage(entries, folded.activeObservations).length;
	const flaggedActiveObservationCount = folded.activeObservations.filter((observation) => folded.flaggedObservationIds.has(observation.id)).length;
	const reflectionWorkCount = unreflectedObservationCount + flaggedActiveObservationCount;
	const visibleObservationCount = nextContextProjection(entries, fullProjection(entries)).observations.length;
	return {
		observerDue: sourceEntryCountSinceObservationCoverage(entries) >= runtime.config.observeEveryMessages,
		reflectorDue: reflectionWorkCount >= runtime.config.reflectEveryObservations,
		curatorEmergencyDue: visibleObservationCount > runtime.config.emergencyCurateWhenVisibleObservationsOver,
	};
}

export function anyMemoryUpdateStageDue(entries: Entry[], runtime: Runtime): boolean {
	const due = computeMemoryStageDue(entries, runtime);
	return due.observerDue || due.reflectorDue || due.curatorEmergencyDue;
}
