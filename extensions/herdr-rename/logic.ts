export const HERDR_RENAME_ENTRY = "herdr-rename";

export interface TabBaseline {
	sessionId: string;
	tabId: string;
	workspaceId: string;
	label: string;
}

export interface SessionTabState {
	baseline?: TabBaseline;
	renamed: boolean;
}

type CustomEntry = {
	type: "custom";
	customType: string;
	data?: unknown;
};

type BaselineEntryData = TabBaseline & {
	kind: "baseline";
};

type RenamedEntryData = {
	kind: "renamed";
	sessionId: string;
	tabId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isCustomEntry(value: unknown): value is CustomEntry {
	return isRecord(value) && value.type === "custom" && value.customType === HERDR_RENAME_ENTRY;
}

function readBaseline(value: unknown): BaselineEntryData | undefined {
	if (!isRecord(value) || value.kind !== "baseline" ||
		typeof value.sessionId !== "string" || typeof value.tabId !== "string" ||
		typeof value.workspaceId !== "string" || typeof value.label !== "string") {
		return undefined;
	}
	return value as unknown as BaselineEntryData;
}

function readRenamed(value: unknown): RenamedEntryData | undefined {
	if (!isRecord(value) || value.kind !== "renamed" ||
		typeof value.sessionId !== "string" || typeof value.tabId !== "string") {
		return undefined;
	}
	return value as RenamedEntryData;
}

export function restoreSessionTabState(
	entries: readonly unknown[],
	sessionId: string,
	tabId: string,
	workspaceId: string,
): SessionTabState {
	let baseline: TabBaseline | undefined;
	let renamed = false;

	for (const entry of entries) {
		if (!isCustomEntry(entry)) continue;
		const restoredBaseline = readBaseline(entry.data);
		if (restoredBaseline?.sessionId === sessionId && restoredBaseline.tabId === tabId &&
			restoredBaseline.workspaceId === workspaceId) {
			baseline = restoredBaseline;
		}
		const restoredMarker = readRenamed(entry.data);
		if (restoredMarker?.sessionId === sessionId && restoredMarker.tabId === tabId) {
			renamed = true;
		}
	}

	return { baseline, renamed };
}

export type AutomaticRenameDecision =
	| "rename"
	| "already-renamed"
	| "baseline-unavailable"
	| "label-changed"
	| "same-name";

export function decideAutomaticRename(
	state: SessionTabState,
	currentLabel: string,
	requestedName: string,
): AutomaticRenameDecision {
	if (state.renamed) return "already-renamed";
	if (!state.baseline) return "baseline-unavailable";
	if (currentLabel !== state.baseline.label) return "label-changed";
	if (requestedName === currentLabel) return "same-name";
	return "rename";
}
