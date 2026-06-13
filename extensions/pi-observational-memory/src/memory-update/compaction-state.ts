import type { Runtime } from "../runtime.js";
import type { Observation, Reflection } from "../session-ledger/index.js";

export type CompactionTransientMemory = {
	observations: Observation[];
	reflections: Reflection[];
};

const transientByRuntime = new WeakMap<Runtime, CompactionTransientMemory>();

export function resetCompactionTransientMemory(runtime: Runtime): CompactionTransientMemory {
	const transient = { observations: [], reflections: [] };
	transientByRuntime.set(runtime, transient);
	return transient;
}

export function getCompactionTransientMemory(runtime: Runtime): CompactionTransientMemory {
	let transient = transientByRuntime.get(runtime);
	if (!transient) transient = resetCompactionTransientMemory(runtime);
	return transient;
}

export function appendTransientCompactionObservations(runtime: Runtime, observations: readonly Observation[]): void {
	if (!runtime.compactHookInFlight || observations.length === 0) return;
	getCompactionTransientMemory(runtime).observations.push(...observations);
}

export function appendTransientCompactionReflections(runtime: Runtime, reflections: readonly Reflection[]): void {
	if (!runtime.compactHookInFlight || reflections.length === 0) return;
	getCompactionTransientMemory(runtime).reflections.push(...reflections);
}
