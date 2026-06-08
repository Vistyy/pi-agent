import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface ConfiguredModel {
	provider: string;
	id: string;
	thinking?: ModelThinkingLevel;
}

export const STRATEGY = {
	additive: "additive",
	replacement: "replacement",
	off: "off",
} as const;
export type MemoryStrategy = (typeof STRATEGY)[keyof typeof STRATEGY];

export interface Config {
	strategy: MemoryStrategy;
	observeEveryMessages: number;
	reflectEveryObservations: number;
	dropWhenActiveObservationsOver: number;
	protectRecentObservations: number;
	maxInitialObserveTokens: number;
	observationsPoolMaxTokens: number;
	agentMaxTurns: number;
	additivePatchMaxTokens: number;
	model?: ConfiguredModel;
	observerThinking?: ModelThinkingLevel;
	reflectorThinking?: ModelThinkingLevel;
	dropperThinking?: ModelThinkingLevel;
	debugLog: boolean;
}

export const DEFAULTS: Config = {
	strategy: STRATEGY.additive,
	observeEveryMessages: 32,
	reflectEveryObservations: 8,
	dropWhenActiveObservationsOver: 80,
	protectRecentObservations: 32,
	maxInitialObserveTokens: 100_000,
	observationsPoolMaxTokens: 20_000,
	agentMaxTurns: 16,
	additivePatchMaxTokens: 2_000,
	observerThinking: "low",
	reflectorThinking: "xhigh",
	dropperThinking: "low",
	debugLog: false,
};

export const THINKING_LEVEL_VALUES: readonly ModelThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

const SETTINGS_KEY = "observational-memory";

function positiveIntegerOrUndefined(value: unknown): number | undefined {
	return Number.isInteger(value) && typeof value === "number" && value > 0 ? value : undefined;
}

function isThinkingLevel(value: unknown): value is ModelThinkingLevel {
	return typeof value === "string" && (THINKING_LEVEL_VALUES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isMemoryStrategy(value: unknown): value is MemoryStrategy {
	return typeof value === "string" && Object.values(STRATEGY).includes(value as MemoryStrategy);
}

function normalizeModel(value: unknown): ConfiguredModel | undefined {
	if (!isRecord(value)) return undefined;
	const provider = nonEmptyString(value.provider);
	const id = nonEmptyString(value.id);
	if (!provider || !id) return undefined;
	const model: ConfiguredModel = { provider, id };
	if (isThinkingLevel(value.thinking)) model.thinking = value.thinking;
	return model;
}

function normalizeSettingsConfig(value: Record<string, unknown>): Partial<Config> {
	const normalized: Partial<Config> = {};
	const numberKeys = [
		"observeEveryMessages",
		"reflectEveryObservations",
		"dropWhenActiveObservationsOver",
		"protectRecentObservations",
		"maxInitialObserveTokens",
		"observationsPoolMaxTokens",
		"agentMaxTurns",
		"additivePatchMaxTokens",
	] as const;
	for (const key of numberKeys) {
		const normalizedValue = positiveIntegerOrUndefined(value[key]);
		if (normalizedValue !== undefined) normalized[key] = normalizedValue;
	}
	if (isMemoryStrategy(value.strategy)) normalized.strategy = value.strategy;
	if (typeof value.debugLog === "boolean") normalized.debugLog = value.debugLog;
	if (isThinkingLevel(value.observerThinking)) normalized.observerThinking = value.observerThinking;
	if (isThinkingLevel(value.reflectorThinking)) normalized.reflectorThinking = value.reflectorThinking;
	if (isThinkingLevel(value.dropperThinking)) normalized.dropperThinking = value.dropperThinking;
	const model = normalizeModel(value.model);
	if (model) normalized.model = model;
	return normalized;
}

function readNamespacedConfig(path: string): Partial<Config> {
	if (!existsSync(path)) return {};
	try {
		const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
		const nested = raw[SETTINGS_KEY];
		return isRecord(nested) ? normalizeSettingsConfig(nested) : {};
	} catch {
		return {};
	}
}

export function loadConfig(cwd: string): Config {
	const globalPath = join(getAgentDir(), "settings.json");
	const projectPath = join(cwd, ".pi", "settings.json");
	const globalConfig = readNamespacedConfig(globalPath);
	const projectConfig = readNamespacedConfig(projectPath);
	return {
		...DEFAULTS,
		...globalConfig,
		...projectConfig,
	};
}
