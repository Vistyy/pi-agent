import { readFile } from "node:fs/promises";
import { parseSessionEntries, type ExtensionContext, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

export const LINK = "code-review.link";
export const ORIGIN = "code-review.origin";
export const REQUEST = "code-review.finalize-request";
export const FINALIZED = "code-review.finalized";
export const FAILED = "code-review.finalize-failed";
export const REPORT = "code-review.report";
export const PREPARING = "code-review.preparing";
export const PREPARATION_CANCELLED = "code-review.prepared";
const RefSchema = Type.Object({ id: Type.String({ minLength: 1 }), file: Type.String({ minLength: 1 }) });
const LinkSchema = Type.Object({ reviewer: RefSchema, title: Type.String() });
const OriginSchema = Type.Object({ author: RefSchema, anchor: Type.String() });
const FinalizedSchema = Type.Object({ requestId: Type.String(), messageId: Type.String() });
const RequestIdentitySchema = Type.Object({ requestId: Type.String() });
const ReportIdentitySchema = Type.Object({ reviewerId: Type.String(), publicationId: Type.String() });
export type SessionRef = Static<typeof RefSchema>;
export type Link = Static<typeof LinkSchema> & { anchor: string; timestamp: string };
export type Origin = Static<typeof OriginSchema>;
export type Publication = { origin: Origin; id: string; text: string };

export function sessionRef(manager: ExtensionContext["sessionManager"]): SessionRef {
	const file = manager.getSessionFile();
	if (!file) throw new Error("Reviews need a persistent Pi session.");
	return { id: manager.getSessionId(), file };
}

export function links(entries: readonly SessionEntry[]): Link[] {
	return entries.flatMap((entry) => entry.type === "custom" && entry.customType === LINK
		? [{ ...Value.Parse(LinkSchema, entry.data), anchor: entry.id, timestamp: entry.timestamp }]
		: []);
}

export function origin(entries: readonly SessionEntry[]): Origin | undefined {
	for (const entry of [...entries].reverse()) {
		if (entry.type === "custom" && entry.customType === ORIGIN) return Value.Parse(OriginSchema, entry.data);
	}
	return undefined;
}

export async function readSession(ref: SessionRef): Promise<SessionEntry[]> {
	const content = await readFile(ref.file, "utf8");
	// Only complete physical lines are published. Never repair another process's file.
	const complete = content.slice(0, content.lastIndexOf("\n") + 1);
	const [header, ...entries] = parseSessionEntries(complete);
	if (!header || header.type !== "session" || header.id !== ref.id) throw new Error(`Saved reviewer identity does not match ${ref.file}`);
	return entries.filter((entry) => entry.type !== "session");
}

export function branch(entries: readonly SessionEntry[], leaf = entries.at(-1)?.id): SessionEntry[] {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const selected: SessionEntry[] = [];
	const visited = new Set<string>();
	while (leaf) {
		if (visited.has(leaf)) throw new Error("Invalid cycle in saved session.");
		visited.add(leaf);
		const entry = byId.get(leaf);
		if (!entry) throw new Error("Missing parent in saved session.");
		selected.push(entry); leaf = entry.parentId ?? undefined;
	}
	return selected.reverse();
}

export function pendingPreparation(entries: readonly SessionEntry[]): string | undefined {
	let pending: string | undefined;
	for (const entry of entries) {
		if (entry.type !== "custom") continue;
		if (entry.customType === PREPARING) pending = entry.id;
		if (entry.customType === LINK) pending = undefined;
		if (entry.customType === PREPARATION_CANCELLED && Value.Parse(RequestIdentitySchema, entry.data).requestId === pending) pending = undefined;
	}
	return pending;
}

export function pendingFinalization(entries: readonly SessionEntry[]): string | undefined {
	let pending: string | undefined;
	for (const entry of entries) {
		if (entry.type !== "custom") continue;
		if (entry.customType === REQUEST) pending = entry.id;
		if (entry.customType === FINALIZED && Value.Parse(FinalizedSchema, entry.data).requestId === pending) pending = undefined;
		if (entry.customType === FAILED && Value.Parse(RequestIdentitySchema, entry.data).requestId === pending) pending = undefined;
	}
	return pending;
}

export function completeAnswer(entry: SessionEntry | undefined): string | undefined {
	if (entry?.type !== "message" || entry.message.role !== "assistant" || entry.message.stopReason !== "stop") return undefined;
	const text = entry.message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	return text || undefined;
}

export function finalAnswer(entries: readonly SessionEntry[], requestId: string): { messageId: string; text: string } | undefined {
	const index = entries.findIndex((entry) => entry.id === requestId);
	if (index === -1) return undefined;
	const following = entries.slice(index + 1);
	if (following.filter((entry) => entry.type === "message" && entry.message.role === "user").length !== 1) return undefined;
	const last = following.findLast((entry) => entry.type === "message");
	const text = completeAnswer(last);
	return text && last ? { messageId: last.id, text } : undefined;
}

export function alreadyFinalized(entries: readonly SessionEntry[]): boolean {
	const lastMessage = entries.findLast((entry) => entry.type === "message");
	return entries.some((entry) => entry.type === "custom" && entry.customType === FINALIZED && Value.Parse(FinalizedSchema, entry.data).messageId === lastMessage?.id);
}

export function publications(entries: readonly SessionEntry[]): Publication[] {
	return entries.flatMap((entry) => {
		if (entry.type !== "custom" || entry.customType !== FINALIZED) return [];
		const finalized = Value.Parse(FinalizedSchema, entry.data);
		const path = branch(entries, entry.id);
		const binding = origin(path);
		const answer = finalAnswer(path.slice(0, -1), finalized.requestId);
		if (!binding || !answer || answer.messageId !== finalized.messageId) throw new Error("Finalized review does not reference its complete report.");
		return [{ origin: binding, id: entry.id, text: answer.text }];
	});
}

export function hasReport(entries: readonly SessionEntry[], reviewerId: string, publicationId: string): boolean {
	return entries.some((entry) => {
		if (entry.type !== "custom_message" || entry.customType !== REPORT) return false;
		const identity = Value.Parse(ReportIdentitySchema, entry.details);
		return identity.reviewerId === reviewerId && identity.publicationId === publicationId;
	});
}
