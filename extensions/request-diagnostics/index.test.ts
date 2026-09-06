import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("provider hook observes but does not replace a synthetic payload", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-request-diagnostics-"));
	const logPath = join(directory, "diagnostics.jsonl");
	const previousEnvironment = {
		enabled: process.env.PI_REQUEST_DIAGNOSTICS,
		log: process.env.PI_REQUEST_DIAGNOSTICS_LOG,
		key: process.env.PI_REQUEST_DIAGNOSTICS_KEY,
	};
	process.env.PI_REQUEST_DIAGNOSTICS = "1";
	process.env.PI_REQUEST_DIAGNOSTICS_LOG = logPath;
	process.env.PI_REQUEST_DIAGNOSTICS_KEY = "synthetic-extension-key";

	try {
		const handlers = new Map<string, (event: any, ctx: any) => unknown>();
		const extension = (await import(`./index.ts?synthetic=${Date.now()}`)).default as any;
		extension({
			registerCommand() {},
			on(name: string, handler: (event: any, ctx: any) => unknown) {
				handlers.set(name, handler);
			},
		});

		const payload = {
			model: "gpt-6-astra",
			instructions: "private instructions",
			input: [{ role: "user", content: [{ type: "input_text", text: "private prompt" }] }],
			prompt_cache_key: "private cache key",
		};
		const before = structuredClone(payload);
		const ctx = {
			model: { provider: "openai-codex", id: "gpt-6-astra", api: "openai-codex-responses" },
			sessionManager: { getSessionId: () => "private session" },
		};
		assert.equal(await handlers.get("before_provider_request")?.({ type: "before_provider_request", payload }, ctx), undefined);
		assert.deepEqual(payload, before);
		await handlers.get("before_provider_headers")?.(
			{ type: "before_provider_headers", headers: { Authorization: "Bearer credential-secret", "content-type": "application/json" } },
			ctx,
		);
		await handlers.get("after_provider_response")?.(
			{ type: "after_provider_response", status: 200, headers: { "x-request-id": "response-secret" } },
			ctx,
		);
		await handlers.get("message_end")?.(
			{
				type: "message_end",
				message: {
					role: "assistant",
					provider: "openai-codex",
					model: "gpt-6-astra",
					api: "openai-codex-responses",
					responseId: "response-secret",
					content: [{ type: "text", text: "private answer" }],
					usage: { input: 3, output: 2, cacheRead: 1, cacheWrite: 0, totalTokens: 6 },
					stopReason: "stop",
					diagnostics: [{ type: "provider_transport_failure", details: { configuredTransport: "auto", requestBytes: 99 } }],
				},
			},
			ctx,
		);
		await handlers.get("session_shutdown")?.({}, ctx);

		const records = (await readFile(logPath, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.ok(records.some((record) => record.kind === "request"));
		const request = records.find((record) => record.kind === "request");
		const response = records.find((record) => record.kind === "response");
		const usage = records.find((record) => record.kind === "usage");
		assert.equal(response.requestId, request.requestId);
		assert.equal(usage.requestId, request.requestId);
		assert.deepEqual(usage.usage, { input: 3, output: 2, cacheRead: 1, cacheWrite: 0, totalTokens: 6 });
		assert.deepEqual(usage.transportDiagnostics, [{ type: "provider_transport_failure", configuredTransport: "auto", requestBytes: 99 }]);
		assert.ok(!JSON.stringify(records).includes("private prompt"));
		assert.ok(!JSON.stringify(records).includes("private instructions"));
		assert.ok(!JSON.stringify(records).includes("private cache key"));
		assert.ok(!JSON.stringify(records).includes("gpt-6-astra"));
		assert.ok(!JSON.stringify(records).includes("credential-secret"));
		assert.ok(!JSON.stringify(records).includes("response-secret"));
	} finally {
		if (previousEnvironment.enabled === undefined) delete process.env.PI_REQUEST_DIAGNOSTICS;
		else process.env.PI_REQUEST_DIAGNOSTICS = previousEnvironment.enabled;
		if (previousEnvironment.log === undefined) delete process.env.PI_REQUEST_DIAGNOSTICS_LOG;
		else process.env.PI_REQUEST_DIAGNOSTICS_LOG = previousEnvironment.log;
		if (previousEnvironment.key === undefined) delete process.env.PI_REQUEST_DIAGNOSTICS_KEY;
		else process.env.PI_REQUEST_DIAGNOSTICS_KEY = previousEnvironment.key;
		await rm(directory, { recursive: true, force: true });
	}
});
