import {
	buildObservationsFlaggedData,
	buildObservationsPinnedData,
	buildObservationsUnpinnedData,
} from "../../session-ledger/index.js";
import type { CuratorActionResult } from "./agent.js";

export type CuratorBatch = { observationIds: string[]; reason: string };

export function emptyCuratorResult(): CuratorActionResult {
	return { pinned: [], unpinned: [], flagged: [], dropped: [] };
}

export function partitionObservationIds(ids: readonly string[] | undefined, allowedIds: ReadonlySet<string>): { accepted: string[]; rejected: Array<{ id: string; reason: string }> } {
	if (!ids || ids.length === 0) return { accepted: [], rejected: [] };
	const accepted: string[] = [];
	const rejected: Array<{ id: string; reason: string }> = [];
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) {
			rejected.push({ id, reason: "duplicate" });
			continue;
		}
		seen.add(id);
		if (!allowedIds.has(id)) {
			rejected.push({ id, reason: "not_action_candidate" });
			continue;
		}
		accepted.push(id);
	}
	return { accepted, rejected };
}

export function removeIdsFromBatches(batches: CuratorBatch[], ids: ReadonlySet<string>): CuratorBatch[] {
	return batches
		.map((batch) => ({ ...batch, observationIds: batch.observationIds.filter((id) => !ids.has(id)) }))
		.filter((batch) => batch.observationIds.length > 0);
}

export function batchIds(batches: readonly CuratorBatch[]): Set<string> {
	return new Set(batches.flatMap((batch) => batch.observationIds));
}

export function mergeCuratorResults(results: CuratorActionResult[]): CuratorActionResult {
	const pinned = results.flatMap((result) => result.pinned);
	const unpinned = results.flatMap((result) => result.unpinned);
	const flagged = results.flatMap((result) => result.flagged);
	const dropped = results.flatMap((result) => result.dropped);
	const unpinnedIds = batchIds(unpinned);
	return {
		pinned: removeIdsFromBatches(pinned, unpinnedIds),
		unpinned,
		flagged: removeIdsFromBatches(flagged, unpinnedIds),
		dropped,
	};
}

export function appendPinned(result: CuratorActionResult, ids: string[], reason: string): void {
	const blocked = new Set([...result.dropped, ...batchIds(result.unpinned), ...batchIds(result.pinned)]);
	const data = buildObservationsPinnedData(ids.filter((id) => !blocked.has(id)), reason);
	if (data) result.pinned.push(data);
}

export function appendUnpinned(result: CuratorActionResult, ids: string[], reason: string): void {
	const blocked = new Set([...result.dropped, ...batchIds(result.pinned)]);
	const data = buildObservationsUnpinnedData(ids.filter((id) => !blocked.has(id)), reason);
	if (data) result.unpinned.push(data);
}

export function appendFlagged(result: CuratorActionResult, ids: string[], reason: string): void {
	const alreadyFlagged = batchIds(result.flagged);
	const data = buildObservationsFlaggedData(ids.filter((id) => !result.dropped.includes(id) && !alreadyFlagged.has(id)), reason);
	if (data) result.flagged.push(data);
}

export function hasCuratorActions(result: CuratorActionResult): boolean {
	return result.pinned.length > 0 || result.unpinned.length > 0 || result.flagged.length > 0 || result.dropped.length > 0;
}
