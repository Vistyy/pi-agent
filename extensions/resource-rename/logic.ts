export const SESSION_NAME_ENTRY = "resource-rename";

export type RestoreDecision = "restore" | "already-restored" | "preserve";

type CustomEntry = {
	type: "custom";
	customType: string;
	data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isOwnedEntry(value: unknown): value is CustomEntry {
	return isRecord(value) && value.type === "custom" && value.customType === SESSION_NAME_ENTRY;
}

function compactAlias(data: unknown): string | undefined {
	if (!isRecord(data) || typeof data.tabName !== "string") return undefined;
	return data.tabName.trim() || undefined;
}

function legacyAlias(data: unknown): string | undefined {
	if (!isRecord(data) || data.kind !== "automatic-name" || data.target !== "tab" ||
		typeof data.name !== "string" || !data.name.trim()) return undefined;
	return data.name.trim();
}

/** Return the latest alias on the supplied active branch. */
export function findBranchTabName(entries: readonly unknown[]): string | undefined {
	let alias: string | undefined;
	for (const entry of entries) {
		if (!isOwnedEntry(entry)) continue;
		alias = compactAlias(entry.data) ?? legacyAlias(entry.data) ?? alias;
	}
	return alias;
}

export function decideTabRestore(label: string, tabNumber: number, alias: string): RestoreDecision {
	if (label === alias) return "already-restored";
	return label === String(tabNumber) ? "restore" : "preserve";
}

export function normalizeSessionNames(input: {
	piName: unknown;
	tabName?: unknown;
}): { piName: string; tabName?: string } {
	const piName = typeof input.piName === "string" ? input.piName.trim() : "";
	if (!piName) throw new Error("piName must not be blank.");

	if (input.tabName === undefined) return { piName };
	const tabName = typeof input.tabName === "string" ? input.tabName.trim() : "";
	if (!tabName) throw new Error("tabName must not be blank when supplied.");
	return { piName, tabName };
}

export function parseRenameCommand(args: string): { queue: true } | { queue: false; error: string } {
	return args.trim()
		? { queue: false, error: "Usage: /rename" }
		: { queue: true };
}
