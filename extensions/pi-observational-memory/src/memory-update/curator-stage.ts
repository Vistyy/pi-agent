import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runCurator } from "../agents/curator/agent.js";
import { debugLog } from "../debug-log.js";
import type { Runtime } from "../runtime.js";
import {
	OM_OBSERVATIONS_CURATED,
	OM_OBSERVATIONS_DROPPED,
	OM_OBSERVATIONS_FLAGGED,
	OM_OBSERVATIONS_PINNED,
	OM_OBSERVATIONS_RECORDED,
	OM_OBSERVATIONS_UNPINNED,
	buildObservationsCuratedData,
	buildObservationsDroppedData,
	classifyObservationsByReview,
	earlierCoverageMarkerId,
	entryIndexById,
	foldLedger,
	latestCoverageMarkerId,
	latestCuratorCursorIndex,
	latestReflectionReviewEntryIndex,
	latestReflectionReviewMarkerId,
	type Entry,
	type Observation,
} from "../session-ledger/index.js";
import { commonAgentArgs } from "./stage-utils.js";
import type { MemoryUpdateCtx, ResolveMemoryModel, StageOutcome } from "./types.js";

function hasSourceAfterCursor(observation: Observation, entryIndexes: ReadonlyMap<string, number>, cursorIndex: number): boolean {
	return observation.sourceEntryIds.some((sourceEntryId) => (entryIndexes.get(sourceEntryId) ?? -1) > cursorIndex);
}

export async function runCuratorStage(
	pi: ExtensionAPI,
	runtime: Runtime,
	ctx: MemoryUpdateCtx,
	resolveModel: ResolveMemoryModel,
): Promise<StageOutcome> {
	const entries = ctx.sessionManager.getBranch() as Entry[];
	const observationCoverageId = latestCoverageMarkerId(entries, OM_OBSERVATIONS_RECORDED);
	const reflectionCoverageId = latestReflectionReviewMarkerId(entries);
	if (!observationCoverageId || !reflectionCoverageId) {
		debugLog("curator.waiting_for_review", { hasObservationCoverage: Boolean(observationCoverageId), hasReflectionReviewCoverage: Boolean(reflectionCoverageId) });
		return "continue";
	}

	const folded = foldLedger(entries, { pendingFlagsAfterIndex: latestReflectionReviewEntryIndex(entries) });
	const classified = classifyObservationsByReview(entries, folded.activeObservations);
	const entryIndexes = entryIndexById(entries);
	const curatorCursorIndex = latestCuratorCursorIndex(entries);
	const candidates = classified.reviewed.filter((observation) => hasSourceAfterCursor(observation, entryIndexes, curatorCursorIndex));
	if (candidates.length === 0) {
		debugLog("curator.no_new_candidates", { curatorCursorIndex, reviewedObservationCount: classified.reviewed.length });
		return "continue";
	}

	debugLog("curator.stage_start", {
		candidateObservationCount: candidates.length,
		reviewedObservationCount: classified.reviewed.length,
		unreviewedObservationCount: classified.unreviewed.length,
		curatorCursorIndex,
		observationCoverageId,
		reflectionCoverageId,
	});

	if (ctx.hasUI) ctx.ui?.notify(`Observational memory: curator running (${candidates.length.toLocaleString()} newly reviewed observations)`, "info");
	const resolved = await resolveModel("curator");
	if (!resolved) return "abort";

	const candidateIds = new Set(candidates.map((observation) => observation.id));
	const recentProtectedIds = new Set(folded.activeObservations.slice(-runtime.config.protectRecentObservations).map((observation) => observation.id));
	const protectedObservationIds = folded.activeObservations
		.filter((observation) => recentProtectedIds.has(observation.id) || classified.unreviewed.some((unreviewed) => unreviewed.id === observation.id))
		.map((observation) => observation.id);
	const maxDropsAllowed = Math.min(candidates.length, 4);

	const result = await runCurator({
		...commonAgentArgs(pi, runtime, resolved, runtime.config.curatorThinking),
		reflections: folded.reflections,
		observations: folded.activeObservations,
		candidateObservationIds: [...candidateIds],
		contextObservations: classified.reviewed.filter((observation) => !candidateIds.has(observation.id)),
		pinnedObservationIds: [...folded.pinnedObservationIds],
		flaggedObservationIds: [...folded.flaggedObservationIds],
		maxDropsAllowed,
		protectedObservationIds,
	});
	if (!result) return "continue";

	for (const batch of result.pinned) pi.appendEntry(OM_OBSERVATIONS_PINNED, batch);
	for (const batch of result.unpinned) pi.appendEntry(OM_OBSERVATIONS_UNPINNED, batch);
	for (const batch of result.flagged) pi.appendEntry(OM_OBSERVATIONS_FLAGGED, batch);

	const dropCoversUpToId = earlierCoverageMarkerId(entries, observationCoverageId, reflectionCoverageId);
	const droppedData = dropCoversUpToId && result.dropped.length > 0 ? buildObservationsDroppedData(result.dropped, dropCoversUpToId) : undefined;
	if (droppedData) pi.appendEntry(OM_OBSERVATIONS_DROPPED, droppedData);

	const curatedData = buildObservationsCuratedData(observationCoverageId);
	if (curatedData) pi.appendEntry(OM_OBSERVATIONS_CURATED, curatedData);
	return "continue";
}
