import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import openaiFast, { fastPreferences, savedSessionOverride } from "./index.js";

void test("the global default persists outside extension discovery and defaults off", async () => {
	const root = await mkdtemp(join(tmpdir(), "openai-fast-"));
	const path = join(root, "state", "openai-fast-default");
	const preferences = fastPreferences(path);

	try {
		assert.equal(await preferences.load(), false);
		await preferences.save(true);
		assert.equal(await fastPreferences(path).load(), true);
		assert.equal(await readFile(path, "utf8"), "on\n");
		await preferences.save(false);
		assert.equal(await preferences.load(), false);
		assert.deepEqual(await readdir(join(root, "state")), ["openai-fast-default"]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

void test("only explicit v2 choices override the global default", () => {
	const entries = [
		{ type: "custom", customType: "openai-fast-preference", data: { sessionId: "a", enabled: false } },
		{ type: "custom", customType: "openai-fast-override-v2", data: { sessionId: "a", enabled: true } },
		{ type: "custom", customType: "openai-fast-override-v2", data: { sessionId: "b", enabled: false } },
	];

	assert.equal(savedSessionOverride(entries, "a"), true);
	assert.equal(savedSessionOverride(entries, "b"), false);
	assert.equal(savedSessionOverride(entries, "fork"), undefined);
	assert.equal(
		savedSessionOverride(entries.slice(0, 1), "a"),
		undefined,
		"a legacy snapshot alone must not become an override",
	);
});

void test("default changes apply now and override-free reloads follow them", async () => {
	let globalDefault = false;
	const entries: any[] = [];
	const first = harness(entries, {
		load: async () => globalDefault,
		save: async (enabled: boolean) => {
			globalDefault = enabled;
		},
	});

	await first.start();
	assert.equal(entries.length, 0, "startup must not freeze the global default into the session");
	assert.equal(first.request(), undefined);

	await first.command("");
	assert.equal(savedSessionOverride(entries, "session-a"), true);
	assert.deepEqual(first.request({ model: "gpt" }), { model: "gpt", service_tier: "priority" });
	assert.equal(first.request({ model: "gpt" }, "anthropic"), undefined);

	await first.command("default off");
	assert.equal(globalDefault, false);
	assert.equal(savedSessionOverride(entries, "session-a"), null);
	assert.equal(first.request(), undefined, "the new default applies to the current session immediately");

	globalDefault = true;
	const reloaded = harness(entries, {
		load: async () => globalDefault,
		save: async () => undefined,
	});
	await reloaded.start();
	assert.equal(reloaded.request()?.service_tier, "priority", "reload must read the current global default");
});

function harness(
	entries: any[],
	preferences: { load(): Promise<boolean>; save(enabled: boolean): Promise<void> },
) {
	const handlers = new Map<string, (...args: any[]) => any>();
	let fastCommand: { handler(args: string, ctx: any): Promise<void> } | undefined;
	const ctx = {
		hasUI: true,
		model: { provider: "openai-codex" },
		sessionManager: {
			getSessionId: () => "session-a",
			getEntries: () => entries,
		},
		ui: {
			theme: { fg: (_color: string, value: string) => value },
			setStatus: () => undefined,
			notify: () => undefined,
		},
	};
	const pi = {
		on(name: string, handler: (...args: any[]) => any) {
			handlers.set(name, handler);
		},
		registerCommand(name: string, definition: typeof fastCommand) {
			assert.equal(name, "fast");
			fastCommand = definition;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
	};

	openaiFast(pi as any, preferences);
	return {
		start: () => handlers.get("session_start")?.({}, ctx),
		command: (args: string) => fastCommand!.handler(args, ctx),
		request: (payload: Record<string, unknown> = {}, provider = "openai-codex") =>
			handlers.get("before_provider_request")?.(
				{ payload },
				{ ...ctx, model: { provider } },
			),
	};
}
