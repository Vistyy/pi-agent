export const LEARNING_MODE_STATE_TYPE = "learning-mode.state";
export const LEARNING_MODE_CONTRACT_MARKER = "<!-- learning-mode-contract -->";
export const LEARNING_MODE_REMINDER_TYPE = "learning-mode.reminder";
export const LEARNING_MODE_REMINDER =
	"Learning mode is active. Follow the Learning Mode Mentoring Contract in the system prompt, own the teaching process, and do not assume shared repository context.";
export const DEFAULT_LEARNING_MODE = true;

type CustomEntryLike = {
	type?: unknown;
	customType?: unknown;
	data?: unknown;
};

export type LearningCommand =
	| { action: "status" }
	| { action: "set"; enabled: boolean }
	| { action: "invalid" };

export function parseLearningCommand(args: string): LearningCommand {
	switch (args.trim().toLowerCase()) {
		case "":
			return { action: "status" };
		case "on":
			return { action: "set", enabled: true };
		case "off":
			return { action: "set", enabled: false };
		default:
			return { action: "invalid" };
	}
}

export function restoreLearningMode(
	entries: readonly CustomEntryLike[],
	defaultEnabled = DEFAULT_LEARNING_MODE,
): boolean {
	let enabled = defaultEnabled;
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== LEARNING_MODE_STATE_TYPE) continue;
		if (!entry.data || typeof entry.data !== "object" || Array.isArray(entry.data)) continue;
		const candidate = (entry.data as { enabled?: unknown }).enabled;
		if (typeof candidate === "boolean") enabled = candidate;
	}
	return enabled;
}

export function appendMentoringContract(systemPrompt: string, contract: string): string {
	if (systemPrompt.includes(LEARNING_MODE_CONTRACT_MARKER)) return systemPrompt;
	const normalizedContract = contract.trim();
	if (!normalizedContract) return systemPrompt;
	return `${systemPrompt.trimEnd()}\n\n${LEARNING_MODE_CONTRACT_MARKER}\n${normalizedContract}`;
}

type ReminderMessage = {
	role: "custom";
	customType: typeof LEARNING_MODE_REMINDER_TYPE;
	content: typeof LEARNING_MODE_REMINDER;
	display: false;
	timestamp: number;
};

export function appendLearningReminder<T>(
	messages: readonly T[],
	timestamp = Date.now(),
): Array<T | ReminderMessage> {
	const last = messages.at(-1) as { role?: unknown; customType?: unknown } | undefined;
	if (last?.role === "custom" && last.customType === LEARNING_MODE_REMINDER_TYPE) {
		return [...messages];
	}
	return [
		...messages,
		{
			role: "custom",
			customType: LEARNING_MODE_REMINDER_TYPE,
			content: LEARNING_MODE_REMINDER,
			display: false,
			timestamp,
		},
	];
}
