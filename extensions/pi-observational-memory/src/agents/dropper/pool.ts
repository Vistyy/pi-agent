import { observationTokenSum, type Observation } from "../../session-ledger/index.js";

export type ObservationPoolMetrics = {
	observationTokens: number;
	activeObservationCount: number;
	dropWhenActiveObservationsOver: number;
	observationsOverTarget: number;
	maxDropsAllowed: number;
	overTarget: boolean;
	ready: boolean;
};

export function derivedMaxDropCount(activeObservationCount: number): number {
	if (!Number.isFinite(activeObservationCount) || activeObservationCount <= 0) return 0;
	return Math.min(10, Math.max(1, Math.ceil(activeObservationCount * 0.1)));
}

export function observationPoolMetrics(
	observations: readonly Observation[],
	dropWhenActiveObservationsOver: number,
): ObservationPoolMetrics {
	const activeObservationCount = observations.length;
	const overTarget = Number.isFinite(dropWhenActiveObservationsOver)
		&& dropWhenActiveObservationsOver >= 0
		&& activeObservationCount > dropWhenActiveObservationsOver;
	const maxDropsAllowed = overTarget ? derivedMaxDropCount(activeObservationCount) : 0;
	return {
		observationTokens: observationTokenSum(observations),
		activeObservationCount,
		dropWhenActiveObservationsOver,
		observationsOverTarget: Math.max(0, activeObservationCount - dropWhenActiveObservationsOver),
		maxDropsAllowed,
		overTarget,
		ready: overTarget && maxDropsAllowed > 0,
	};
}
