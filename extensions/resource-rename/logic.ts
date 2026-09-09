export const RESOURCE_RENAME_ENTRY = "resource-rename";

export const HERDR_RENAME_TARGETS = ["workspace", "tab", "pane"] as const;
export type HerdrRenameTarget = (typeof HERDR_RENAME_TARGETS)[number];
export type RenameTarget = "pi" | HerdrRenameTarget;
export type RenameMode = "automatic" | "explicit-request";

export interface TabBaseline {
	sessionId: string;
	runId: string;
	tabId: string;
	workspaceId: string;
	label: string;
}

export interface SessionResourceState {
	baseline?: TabBaseline;
	lastAutomaticPiName?: string;
	lastAutomaticTabName?: string;
}

export type SessionTabState = SessionResourceState;

type CustomEntry = {
	type: "custom";
	customType: string;
	data?: unknown;
};

type BaselineEntryData = TabBaseline & {
	kind: "baseline";
};

type AutomaticNameEntryData = {
	kind: "automatic-name";
	sessionId: string;
	target: "pi" | "tab";
	name: string;
	tabId?: string;
	workspaceId?: string;
	runId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isCustomEntry(value: unknown): value is CustomEntry {
	return isRecord(value) && value.type === "custom" && value.customType === RESOURCE_RENAME_ENTRY;
}

function readBaseline(value: unknown): BaselineEntryData | undefined {
	if (!isRecord(value) || value.kind !== "baseline" ||
		typeof value.sessionId !== "string" || value.sessionId.length === 0 ||
		typeof value.runId !== "string" || value.runId.length === 0 ||
		typeof value.tabId !== "string" || value.tabId.length === 0 ||
		typeof value.workspaceId !== "string" || value.workspaceId.length === 0 ||
		typeof value.label !== "string") {
		return undefined;
	}
	return value as unknown as BaselineEntryData;
}

function readAutomaticName(value: unknown): AutomaticNameEntryData | undefined {
	if (!isRecord(value) || value.kind !== "automatic-name" ||
		typeof value.sessionId !== "string" || value.sessionId.length === 0 ||
		(value.target !== "pi" && value.target !== "tab") ||
		typeof value.name !== "string" || value.name.length === 0) {
		return undefined;
	}
	if (value.target === "tab" &&
		(typeof value.tabId !== "string" || value.tabId.length === 0 ||
			typeof value.workspaceId !== "string" || value.workspaceId.length === 0 ||
			typeof value.runId !== "string" || value.runId.length === 0)) {
		return undefined;
	}
	return value as unknown as AutomaticNameEntryData;
}

export function restoreSessionResourceState(
	entries: readonly unknown[],
	sessionId: string,
	tabId?: string,
	workspaceId?: string,
): SessionResourceState {
	let baseline: TabBaseline | undefined;
	let lastAutomaticPiName: string | undefined;
	let lastAutomaticTabName: string | undefined;

	// Only the current generic entry type is recognized. Process entries in
	// session order so a later baseline starts a fresh tab occupancy and cannot
	// inherit a name from an earlier occupancy.
	for (const entry of entries) {
		if (!isCustomEntry(entry)) continue;

		const restoredBaseline = readBaseline(entry.data);
		if (restoredBaseline?.sessionId === sessionId &&
			(!tabId || restoredBaseline.tabId === tabId) &&
			(!workspaceId || restoredBaseline.workspaceId === workspaceId)) {
			baseline = restoredBaseline;
			lastAutomaticTabName = undefined;
			continue;
		}

		const restoredName = readAutomaticName(entry.data);
		if (!restoredName || restoredName.sessionId !== sessionId) continue;
		if (restoredName.target === "pi") {
			lastAutomaticPiName = restoredName.name;
			continue;
		}
		if (baseline && tabId && workspaceId &&
			restoredName.tabId === tabId && restoredName.workspaceId === workspaceId &&
			restoredName.runId === baseline.runId) {
			lastAutomaticTabName = restoredName.name;
		}
	}

	return { baseline, lastAutomaticPiName, lastAutomaticTabName };
}

export type AutomaticTabRenameDecision =
	| "rename"
	| "baseline-unavailable"
	| "label-changed"
	| "same-name";

export function decideAutomaticTabRename(
	state: SessionResourceState,
	currentLabel: string,
	requestedName: string,
): AutomaticTabRenameDecision {
	if (!state.baseline) return "baseline-unavailable";
	if (state.lastAutomaticTabName === undefined) {
		if (currentLabel !== state.baseline.label) return "label-changed";
	} else if (currentLabel !== state.lastAutomaticTabName) {
		return "label-changed";
	}
	if (requestedName === currentLabel) return "same-name";
	return "rename";
}

export type AutomaticPiRenameDecision = "rename" | "live-name-changed" | "same-name";

export function decideAutomaticPiRename(
	currentName: string | undefined,
	lastAutomaticName: string | undefined,
	requestedName: string,
): AutomaticPiRenameDecision {
	if (lastAutomaticName === undefined) {
		return currentName === undefined ? "rename" : "live-name-changed";
	}
	if (currentName !== lastAutomaticName) return "live-name-changed";
	if (currentName === requestedName) return "same-name";
	return "rename";
}

export interface PiRenameOperations {
	getSessionName(): string | undefined;
	setSessionName(name: string): void;
}

export interface PiRenameResult {
	decision: AutomaticPiRenameDecision;
	name: string;
}

/**
 * Apply the Pi decision without coupling it to Herdr. Automatic calls never
 * rewrite a live display name that was not initially empty or last set by this
 * extension.
 */
export function applyPiRename(
	operations: PiRenameOperations,
	requestedName: string,
	explicit: boolean,
	lastAutomaticName?: string,
): PiRenameResult {
	if (explicit) {
		operations.setSessionName(requestedName);
		return { decision: "rename", name: requestedName };
	}

	const decision = decideAutomaticPiRename(
		operations.getSessionName(),
		lastAutomaticName,
		requestedName,
	);
	if (decision === "rename") operations.setSessionName(requestedName);
	return { decision, name: requestedName };
}

export interface RenameRequest {
	piName?: unknown;
	herdr?: {
		target?: unknown;
		name?: unknown;
	};
	mode?: unknown;
}

export interface ValidatedRenameRequest {
	piName?: string;
	herdr?: {
		target: HerdrRenameTarget;
		name: string;
	};
	mode: RenameMode;
}

export type RenameRequestValidation =
	| { valid: true; request: ValidatedRenameRequest }
	| { valid: false; error: string };

export function validateRenameRequest(
	input: RenameRequest,
	insideHerdr: boolean,
): RenameRequestValidation {
	const mode = input.mode === undefined ? "automatic" : input.mode;
	if (mode !== "automatic" && mode !== "explicit-request") {
		return { valid: false, error: "mode must be automatic or explicit-request." };
	}

	const hasPiName = input.piName !== undefined;
	const hasHerdr = input.herdr !== undefined;
	if (!hasPiName && !hasHerdr) {
		return { valid: false, error: "Provide piName, herdr, or both." };
	}

	let piName: string | undefined;
	if (hasPiName) {
		if (typeof input.piName !== "string" || !(piName = input.piName.trim())) {
			return { valid: false, error: "piName must not be empty or whitespace." };
		}
	}

	let herdr: ValidatedRenameRequest["herdr"];
	if (hasHerdr) {
		if (!isRecord(input.herdr) ||
			typeof input.herdr.target !== "string" ||
			!HERDR_RENAME_TARGETS.includes(input.herdr.target as HerdrRenameTarget) ||
			typeof input.herdr.name !== "string" || !input.herdr.name.trim()) {
			return { valid: false, error: "herdr must contain one target (workspace, tab, or pane) and a non-empty name." };
		}
		herdr = {
			target: input.herdr.target as HerdrRenameTarget,
			name: input.herdr.name.trim(),
		};
	}

	if (mode === "automatic") {
		if (insideHerdr) {
			if (!piName || !herdr || herdr.target !== "tab") {
				return { valid: false, error: "Automatic naming inside Herdr requires both piName and herdr.target=tab." };
			}
			if (piName === herdr.name) {
				return { valid: false, error: "Automatic piName and Herdr tab name must be distinct after trimming." };
			}
		} else if (!piName || herdr) {
			return { valid: false, error: "Automatic naming outside Herdr requires piName only." };
		}
	}

	return { valid: true, request: { piName, herdr, mode } };
}

export type RenameCommandAction =
	| { kind: "queue"; target: "both" | RenameTarget }
	| { kind: "direct"; target: RenameTarget; name: string }
	| { kind: "error"; message: string };

const COMMAND_TARGET_ALIASES: Record<string, RenameTarget> = {
	pi: "pi",
	tab: "tab",
	workspace: "workspace",
	pane: "pane",
};

export function stripOneMatchingOuterQuotePair(value: string): string {
	if (value.length >= 2 &&
		((value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'")))) {
		return value.slice(1, -1);
	}
	return value;
}

export function parseRenameCommand(args: string): RenameCommandAction {
	const input = args.trim();
	if (!input) return { kind: "queue", target: "both" };

	const separator = input.search(/\s/);
	const targetToken = (separator < 0 ? input : input.slice(0, separator)).toLowerCase();
	const rest = separator < 0 ? "" : input.slice(separator).trim();
	if (targetToken === "both") {
		return rest
			? { kind: "error", message: "`/rename both` chooses the normal Pi+tab pair; provide no single name. Choose one target for a direct rename." }
			: { kind: "queue", target: "both" };
	}

	const target = COMMAND_TARGET_ALIASES[targetToken];
	if (!target) {
		return { kind: "error", message: "Unknown rename target. Use both, pi, tab, workspace, or pane." };
	}
	if (!rest) return { kind: "queue", target };

	const name = stripOneMatchingOuterQuotePair(rest);
	if (!name.trim()) return { kind: "error", message: "A direct rename needs a non-empty name." };
	return { kind: "direct", target, name };
}

export interface RenameCommandHandlers {
	onQueue(target: "both" | RenameTarget): void | Promise<void>;
	onDirect(target: RenameTarget, name: string): void | Promise<void>;
	onError(message: string): void | Promise<void>;
}

export async function dispatchRenameCommand(
	args: string,
	handlers: RenameCommandHandlers,
): Promise<void> {
	const action = parseRenameCommand(args);
	if (action.kind === "error") return handlers.onError(action.message);
	if (action.kind === "queue") return handlers.onQueue(action.target);
	return handlers.onDirect(action.target, action.name);
}
