import { createHmac } from "node:crypto";

export type KeyedHasher = (domain: string, value: unknown) => string;

export interface RequestFingerprint {
	inputKey: string | null;
	inputItemHashes: string[];
	inputSequenceHash: string;
	nonInputFieldHashes: Record<string, string>;
	nonInputHash: string;
	payloadHash: string;
	cacheKeyHashes: Record<string, string>;
}

export interface RequestComparison {
	relation: "identical" | "append_only" | "truncated" | "diverged";
	previousInputCount: number;
	currentInputCount: number;
	sharedPrefixCount: number;
	earliestDivergence: number | null;
	appendedItemCount: number;
	changedNonInputFields: string[];
	cacheKeyMatch: boolean;
}

const INPUT_KEYS = ["input", "messages", "contents"] as const;
const OMIT = Symbol("omit");

export function createKeyedHasher(key: Uint8Array): KeyedHasher {
	return (domain, value) =>
		createHmac("sha256", key)
			.update(domain)
			.update("\0")
			.update(stableStringify(value))
			.digest("hex");
}

export function stableStringify(value: unknown): string {
	const normalized = normalizeJson(value, false, new WeakSet<object>());
	return JSON.stringify(normalized === OMIT ? null : normalized) ?? "null";
}

export function fingerprintPayload(payload: unknown, hash: KeyedHasher): RequestFingerprint {
	const body = isRecord(payload) ? payload : { value: payload };
	const inputKey = INPUT_KEYS.find((key) => Array.isArray(body[key])) ?? null;
	const input = inputKey ? (body[inputKey] as unknown[]) : [];
	const inputItemHashes = input.map((item) => hash("input-item", item));
	const nonInputFieldHashes: Record<string, string> = {};

	for (const key of Object.keys(body).sort()) {
		if (key === inputKey) continue;
		if (body[key] === undefined) continue;
		nonInputFieldHashes[key] = hash(`non-input:${key}`, body[key]);
	}

	const cacheKeyHashes = Object.fromEntries(
		Object.entries(nonInputFieldHashes).filter(([key]) => isCacheKeyField(key)),
	);
	const inputSequenceHash = hash("input-sequence", inputItemHashes);
	const nonInputHash = hash("non-input-fields", nonInputFieldHashes);

	return {
		inputKey,
		inputItemHashes,
		inputSequenceHash,
		nonInputFieldHashes,
		nonInputHash,
		payloadHash: hash("payload-summary", { inputKey, inputItemHashes, nonInputFieldHashes }),
		cacheKeyHashes,
	};
}

export function compareRequests(current: RequestFingerprint, previous: RequestFingerprint): RequestComparison {
	const currentItems = current.inputItemHashes;
	const previousItems = previous.inputItemHashes;
	const commonLength = Math.min(currentItems.length, previousItems.length);
	let sharedPrefixCount = 0;
	while (sharedPrefixCount < commonLength && currentItems[sharedPrefixCount] === previousItems[sharedPrefixCount]) {
		sharedPrefixCount += 1;
	}

	let relation: RequestComparison["relation"];
	let earliestDivergence: number | null;
	let appendedItemCount = 0;
	const inputFieldChanged = current.inputKey !== previous.inputKey;
	if (inputFieldChanged) {
		relation = "diverged";
		earliestDivergence = 0;
		sharedPrefixCount = 0;
	} else if (sharedPrefixCount < commonLength) {
		relation = "diverged";
		earliestDivergence = sharedPrefixCount;
	} else if (currentItems.length === previousItems.length) {
		relation = "identical";
		earliestDivergence = null;
	} else if (currentItems.length > previousItems.length) {
		relation = "append_only";
		earliestDivergence = null;
		appendedItemCount = currentItems.length - previousItems.length;
	} else {
		relation = "truncated";
		earliestDivergence = currentItems.length;
	}

	const allNonInputFields = new Set([
		...Object.keys(previous.nonInputFieldHashes),
		...Object.keys(current.nonInputFieldHashes),
	]);
	const changedNonInputFields = [...allNonInputFields]
		.filter((key) => previous.nonInputFieldHashes[key] !== current.nonInputFieldHashes[key])
		.sort();
	if (inputFieldChanged) changedNonInputFields.unshift("inputField");

	return {
		relation,
		previousInputCount: previousItems.length,
		currentInputCount: currentItems.length,
		sharedPrefixCount,
		earliestDivergence,
		appendedItemCount,
		changedNonInputFields,
		cacheKeyMatch: stableStringify(previous.cacheKeyHashes) === stableStringify(current.cacheKeyHashes),
	};
}

export function safeHeaderHashes(
	headers: Record<string, string | null | undefined>,
	hash: KeyedHasher,
): Record<string, string> {
	const output: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers)) {
		const normalizedName = name.toLowerCase();
		if (value == null || !SAFE_HEADER_NAMES.has(normalizedName)) continue;
		output[normalizedName] = hash(`header:${normalizedName}`, value);
	}
	return Object.fromEntries(Object.entries(output).sort(([a], [b]) => a.localeCompare(b)));
}

export function safeTransportDiagnostics(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	const output: Record<string, unknown>[] = [];
	for (const item of value) {
		if (!isRecord(item) || item.type !== "provider_transport_failure") continue;
		const details = isRecord(item.details) ? item.details : {};
		const safe: Record<string, unknown> = { type: "provider_transport_failure" };
		for (const key of [
			"configuredTransport",
			"fallbackTransport",
			"eventsEmitted",
			"phase",
			"requestBytes",
		] as const) {
			const detail = details[key];
			if (typeof detail === "string" || typeof detail === "boolean" || typeof detail === "number") {
				safe[key] = detail;
			}
		}
		output.push(safe);
	}
	return output;
}

function normalizeJson(value: unknown, inArray: boolean, ancestors: WeakSet<object>): unknown | typeof OMIT {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value === "bigint") return { $type: "bigint", value: String(value) };
	if (value === undefined || typeof value === "function" || typeof value === "symbol") {
		return inArray ? null : OMIT;
	}
	if (typeof value !== "object") return String(value);
	if (ancestors.has(value)) throw new TypeError("Cannot fingerprint a cyclic provider payload");

	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			return value.map((item) => {
				const normalized = normalizeJson(item, true, ancestors);
				return normalized === OMIT ? null : normalized;
			});
		}

		const toJSON = (value as { toJSON?: unknown }).toJSON;
		if (typeof toJSON === "function") {
			return normalizeJson(toJSON.call(value), inArray, ancestors);
		}

		const output: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			const normalized = normalizeJson((value as Record<string, unknown>)[key], false, ancestors);
			if (normalized !== OMIT) output[key] = normalized;
		}
		return output;
	} finally {
		ancestors.delete(value);
	}
}

function isCacheKeyField(key: string): boolean {
	const normalized = key.toLowerCase().replaceAll("-", "_");
	return normalized.includes("cache") && normalized.includes("key");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

const SAFE_HEADER_NAMES = new Set([
	"accept",
	"content-encoding",
	"content-type",
	"openai-processing-ms",
	"request-id",
	"server",
	"server-timing",
	"traceparent",
	"user-agent",
	"via",
	"x-cache",
	"x-cache-status",
	"x-client-request-id",
	"x-correlation-id",
	"x-openai-processing-ms",
	"x-request-id",
	"x-session-affinity",
	"x-session-id",
	"session_id",
]);
