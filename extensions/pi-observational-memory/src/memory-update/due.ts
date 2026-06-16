import type { Runtime } from "../runtime.js";
import {
	foldLedger,
	reflectionTokenSum,
	sourceEntriesAfterIndex,
	type Entry,
	type Observation,
	type Reflection,
} from "../session-ledger/index.js";

export type MemoryStageWork = {
	observerWork: Entry[];
	reflectorWork: Observation[];
	rewriteWork: Reflection[];
};

export function computeMemoryStageWork(entries: Entry[], runtime: Runtime): MemoryStageWork {
	const folded = foldLedger(entries);
	const observerWork = sourceEntriesAfterIndex(entries, folded.lastObservationCoverageIndex);
	return {
		observerWork: observerWork.length >= runtime.config.observeEveryMessages ? observerWork : [],
		reflectorWork: folded.unreflectedObservations.length >= runtime.config.reflectEveryObservations ? folded.unreflectedObservations : [],
		rewriteWork: reflectionTokenSum(folded.reflections) >= runtime.config.reflectionsPoolMaxTokens ? folded.reflections : [],
	};
}
