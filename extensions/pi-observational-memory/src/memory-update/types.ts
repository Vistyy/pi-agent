import type { ResolveResult } from "../runtime.js";
import type { Reflection } from "../session-ledger/index.js";

export type ResolvedModel = Extract<ResolveResult, { ok: true }>;

export type MemoryUpdateCtx = {
	cwd: string;
	hasUI: boolean;
	ui?: { notify: (message: string, type?: "warning" | "info" | "error") => void };
	model: unknown;
	modelRegistry: any;
	sessionManager: {
		getBranch: () => unknown;
		getSessionId?: () => string;
		getSessionFile?: () => string | undefined;
	};
};

export type StageOutcome = "continue" | "abort";

export type ReflectorStageResult = {
	outcome: StageOutcome;
	sameRunReflections: Reflection[];
	effectiveReflectionCoverageId?: string;
};

export type ResolveMemoryModel = (stage: "observer" | "reflector" | "dropper") => Promise<ResolvedModel | undefined>;
