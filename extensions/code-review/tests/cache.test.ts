import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, type Model, type TranscriptContext } from "@earendil-works/pi-ai";
import { stream } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { expect, test, vi } from "vitest";
import { dispose, eventually, nativeSession } from "./native.ts";

const Payload = Type.Object({
	instructions: Type.String(), prompt_cache_key: Type.String(),
	tools: Type.Array(Type.Object({ name: Type.String() })), input: Type.Array(Type.Unknown()),
});
const AdditionalTools = Type.Object({ type: Type.Literal("additional_tools"), tools: Type.Array(Type.Object({ name: Type.String() })) });
// A synthetic serializer profile, not an available-model lookup or an inference/cache-hit test.
const model: Model<"openai-codex-responses"> = {
	id: "cache-shape-fixture", name: "Cache shape fixture", provider: "openai-codex", api: "openai-codex-responses",
	baseUrl: "http://127.0.0.1:9", reasoning: true, input: ["text"], contextWindow: 128_000, maxTokens: 16_384,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	compat: { supportsAdditionalTools: true, supportsMidConvoSystemMessages: true, supportsOpenAIGrammarTools: true },
};

async function payload(context: TranscriptContext) {
	let body: unknown;
	const jwt = `probe.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "probe-account" } })).toString("base64url")}.probe`;
	const result = await stream(model, context, {
		apiKey: jwt, sessionId: "fixed-cache-shape-session", transport: "sse",
		onPayload(value) { body = value; throw new Error("CAPTURE_ONLY_NO_NETWORK"); },
	}).result();
	expect(result.stopReason).toBe("error");
	expect(result.errorMessage).toContain("CAPTURE_ONLY_NO_NETWORK");
	return Value.Parse(Payload, body);
}

test("five native preparation/cancellation cycles keep the long request prefix and top-level tools stable in actual Codex serialization", async () => {
	const root = await mkdtemp(join(tmpdir(), "code-review-cache-shape-"));
	const oldEnv = { HERDR_ENV: process.env.HERDR_ENV, HERDR_PANE_ID: process.env.HERDR_PANE_ID };
	process.env.HERDR_ENV = "1"; process.env.HERDR_PANE_ID = "owned-cache-shape";
	const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network is forbidden in this serializer test."));
	const captured: TranscriptContext[] = [];
	const responses = [
		...Array.from({ length: 100 }, () => fauxAssistantMessage("Earlier service discussion.")),
		...Array.from({ length: 15 }, () => async (context: TranscriptContext) => { captured.push(structuredClone(context)); return fauxAssistantMessage("Please clarify the intended services."); }),
	];
	const manager = SessionManager.create(root, join(root, "sessions"));
	const runtime = await nativeSession(root, root, manager, responses);
	try {
		for (let i = 0; i < 100; i++) await runtime.session.prompt(`Service contract discussion ${i}. Preserve the request shape across payments and orders.`);
		for (let i = 0; i < 5; i++) {
			await runtime.session.prompt("Continue normal work.");
			await runtime.session.prompt("/review Clarify which services to review.");
			await eventually(() => captured.length === 3 * i + 2 && !runtime.session.isStreaming);
			expect(runtime.session.getActiveToolNames()).toContain("start_review");
			await runtime.session.prompt("/review cancel");
			expect(runtime.session.getActiveToolNames()).not.toContain("start_review");
			await runtime.session.prompt("Continue normal work.");
		}
		expect(runtime.errors).toEqual([]);
		expect(captured).toHaveLength(15);
		const packets = await Promise.all(captured.map(payload));
		for (const packet of packets) {
			expect(packet.tools.map(tool => tool.name)).toEqual(["read", "bash", "edit", "write"]);
			expect(packet.tools).toEqual(packets[0]?.tools);
			expect(packet.instructions).toBe(packets[0]?.instructions);
			expect(packet.prompt_cache_key).toBe("fixed-cache-shape-session");
		}
		for (let i = 0; i < 5; i++) {
			const before = packets[i * 3], active = packets[i * 3 + 1], after = packets[i * 3 + 2];
			if (!before || !active || !after) throw new Error("Missing measured protocol phase.");
			expect(active.input.slice(0, before.input.length)).toEqual(before.input);
			expect(Value.Parse(AdditionalTools, active.input.at(-1)).tools.map(tool => tool.name)).toEqual(["start_review"]);
			const prefix = active.input.slice(0, -1);
			expect(after.input.slice(0, prefix.length)).toEqual(prefix);
			expect(after.input.filter(item => Value.Check(AdditionalTools, item))).toEqual([]);
		}
		expect(manager.getEntries().filter(entry => entry.type === "message" && entry.message.role === "system" && entry.message.toolsRemoved?.some(tool => tool.name === "start_review"))).toHaveLength(5);
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		await dispose(runtime.host); fetch.mockRestore();
		for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
		await rm(root, { recursive: true, force: true });
	}
}, 15_000);
