import { createHash } from "node:crypto";

export const MEMORY_ID_PATTERN = /^[a-f0-9]{12}$/;
export const OBSERVATION_ID_PATTERN = /^obs_[a-f0-9]{12}$/;
export const REFLECTION_ID_PATTERN = /^ref_[a-f0-9]{12}$/;
export const SOURCE_ENTRY_ID_PATTERN = /^src_[A-Za-z0-9_-]+$/;
export const REWRITE_ID_PATTERN = /^rw_[a-f0-9]{12}$/;

export type MemoryIdKind = "observation" | "reflection" | "source" | "rewrite";

export function hashId(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

export function observationId(id: string): string {
	return id.startsWith("obs_") ? id : `obs_${id}`;
}

export function reflectionId(id: string): string {
	return id.startsWith("ref_") ? id : `ref_${id}`;
}

export function rewriteId(id: string): string {
	return id.startsWith("rw_") ? id : `rw_${id}`;
}

export function untypedMemoryId(id: string): string {
	return id.replace(/^(obs_|ref_|rw_)/, "");
}

export function isLegacyMemoryId(value: unknown): value is string {
	return typeof value === "string" && MEMORY_ID_PATTERN.test(value);
}

export function isObservationId(value: unknown): value is string {
	return typeof value === "string" && OBSERVATION_ID_PATTERN.test(value);
}

export function isReflectionId(value: unknown): value is string {
	return typeof value === "string" && REFLECTION_ID_PATTERN.test(value);
}

export function isSourceEntryId(value: unknown): value is string {
	return typeof value === "string" && SOURCE_ENTRY_ID_PATTERN.test(value);
}

export function isRewriteId(value: unknown): value is string {
	return typeof value === "string" && REWRITE_ID_PATTERN.test(value);
}

export function memoryIdKind(id: string): MemoryIdKind | undefined {
	if (isObservationId(id)) return "observation";
	if (isReflectionId(id)) return "reflection";
	if (isSourceEntryId(id)) return "source";
	if (isRewriteId(id)) return "rewrite";
	return undefined;
}
