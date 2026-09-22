import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import openaiFast, { fastPreferences, savedSessionChoice } from "./openai-fast.js";

void test("the global default persists atomically and defaults to off", async () => {
	const root = await mkdtemp(join(tmpdir(), "openai-fast-"));
	const path = join(root, "preferences", "default");
	const preferences = fastPreferences(path);

	try {
		assert.equal(await preferences.load(), false);
		await preferences.save(true);
		assert.equal(await fastPreferences(path).load(), true);
		assert.equal(await readFile(path, "utf8"), "on\n");
		await preferences.save(false);
		assert.equal(await preferences.load(), false);
		assert.equal(await readFile(path, "utf8"), "off\n");
		assert.deepEqual(await readdir(join(root, "preferences")), ["default"]);
		await writeFile(path, "invalid\n");
		await assert.rejects(preferences.load(), /expected on or off/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

void test("session choices restore only for the exact session", () => {
	const entries = [
		{ type: "custom", customType: "openai-fast-preference", data: { sessionId: "a", enabled: true } },
		{ type: "custom", customType: "openai-fast-preference", data: { sessionId: "b", enabled: true } },
		{ type: "custom", customType: "openai-fast-preference", data: { sessionId: "a", enabled: false } },
	];

	assert.equal(savedSessionChoice(entries, "a"), false);
	assert.equal(savedSessionChoice(entries, "b"), true);
	assert.equal(savedSessionChoice(entries, "fork"), undefined);
});

void test("the session toggle persists while changing the default leaves it unchanged", async () => {
	const handlers = new Map<string, (...args: any[]) => any>();
	let command: { handler(args: string, ctx: any): Promise<void> } | undefined;
	const entries: any[] = [];
	const statuses: unknown[] = [];
	const notices: string[] = [];
	let savedDefault: boolean | undefined;
	const pi = {
		on(name: string, handler: (...args: any[]) => any) {
			handlers.set(name, handler);
		},
		registerCommand(name: string, definition: typeof command) {
			assert.equal(name, "fast");
			command = definition;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
	};
	const ctx = {
		hasUI: true,
		model: { provider: "openai-codex" },
		sessionManager: {
			getSessionId: () => "session-a",
			getEntries: () => entries,
		},
		ui: {
			theme: { fg: (_color: string, value: string) => value },
			setStatus: (_id: string, value: unknown) => statuses.push(value),
			notify: (text: string) => notices.push(text),
		},
	};

	openaiFast(pi as any, {
		load: async () => true,
		save: async (enabled) => {
			savedDefault = enabled;
		},
	});
	await handlers.get("session_start")?.({}, ctx);
	assert.equal(savedSessionChoice(entries, "session-a"), true);
	assert.deepEqual(await handlers.get("before_provider_request")?.({ payload: { model: "gpt" } }, ctx), {
		model: "gpt",
		service_tier: "priority",
	});

	await command?.handler("", ctx);
	assert.equal(savedSessionChoice(entries, "session-a"), false);
	assert.equal(await handlers.get("before_provider_request")?.({ payload: {} }, ctx), undefined);

	await command?.handler("default on", ctx);
	assert.equal(savedDefault, true);
	assert.equal(savedSessionChoice(entries, "session-a"), false);
	assert.match(notices.at(-1) ?? "", /This session is unchanged/);
	assert.deepEqual(statuses, ["⚡", undefined]);
});
