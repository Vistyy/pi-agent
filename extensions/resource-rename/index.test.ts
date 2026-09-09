import assert from "node:assert/strict";
import test from "node:test";

import extension from "./index.ts";

const savedEnv = {
	HERDR_ENV: process.env.HERDR_ENV,
	HERDR_PANE_ID: process.env.HERDR_PANE_ID,
	HERDR_TAB_ID: process.env.HERDR_TAB_ID,
	HERDR_BIN_PATH: process.env.HERDR_BIN_PATH,
};

type Fake = {
	handlers: Record<string, (event: unknown, ctx: unknown) => unknown>;
	commands: Record<string, { handler: (args: string, ctx: unknown) => unknown }>;
	tools: Array<{ execute: (...args: any[]) => Promise<any> }>;
	setNames: string[];
	appended: Array<{ type: string; data: unknown }>;
	execCalls: string[][];
	messages: Array<{ text: string; options: unknown }>;
	nextExec: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
};

function makeFake(): Fake {
	const fake: Fake = {
		handlers: {},
		commands: {},
		tools: [],
		setNames: [],
		appended: [],
		execCalls: [],
		messages: [],
		nextExec: async () => ({ code: 0, stdout: "", stderr: "" }),
	};
	const api = {
		on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => { fake.handlers[event] = handler; },
		registerCommand: (name: string, command: { handler: (args: string, ctx: unknown) => unknown }) => { fake.commands[name] = command; },
		registerTool: (tool: { execute: (...args: any[]) => Promise<any> }) => { fake.tools.push(tool); },
		setSessionName: (name: string) => { fake.setNames.push(name); },
		appendEntry: (type: string, data: unknown) => { fake.appended.push({ type, data }); },
		exec: async (_command: string, args: string[]) => {
			fake.execCalls.push(args);
			return fake.nextExec(args);
		},
		sendUserMessage: (text: string, options: unknown) => { fake.messages.push({ text, options }); },
	};
	extension(api as any);
	return fake;
}

function context(branch: unknown[] = [], idle = true) {
	return {
		isIdle: () => idle,
		sessionManager: { getBranch: () => branch },
		ui: { notify: (message: string, level: string) => ({ message, level }) },
	};
}

async function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>) {
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		await run();
	} finally {
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

function tool(fake: Fake) {
	assert.equal(fake.tools.length, 1);
	return fake.tools[0]!;
}

test("name_session sets Pi only outside Herdr", async () => {
	await withEnv({ HERDR_ENV: undefined, HERDR_PANE_ID: undefined, HERDR_TAB_ID: undefined }, async () => {
		const fake = makeFake();
		const result = await tool(fake).execute("call", { piName: "Build API" }, undefined, undefined, context());
		assert.deepEqual(fake.setNames, ["Build API"]);
		assert.deepEqual(fake.execCalls, []);
		assert.match(result.content[0].text, /Pi session named/);
	});
});

test("name_session resolves a moved pane and renames exactly its current Herdr tab", async () => {
	await withEnv({ HERDR_ENV: "1", HERDR_PANE_ID: "tab-old:pane", HERDR_TAB_ID: "tab-old", HERDR_BIN_PATH: "herdr-test" }, async () => {
		const fake = makeFake();
		fake.nextExec = async (args) => {
			if (args[0] === "pane") {
				return { code: 0, stdout: JSON.stringify({ result: { pane: { tab_id: "tab-current" } } }), stderr: "" };
			}
			if (args[0] === "tab" && args[1] === "get") {
				return { code: 0, stdout: JSON.stringify({ result: { tab: { tab_id: "tab-current", label: "4", number: 4 } } }), stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		};
		const result = await tool(fake).execute("call", { piName: "Build API Work", tabName: "API Fix" }, undefined, undefined, context());
		assert.deepEqual(fake.setNames, ["Build API Work"]);
		assert.deepEqual(fake.execCalls, [
			["pane", "current", "--current"],
			["tab", "get", "tab-current"],
			["tab", "rename", "tab-current", "API Fix"],
		]);
		assert.deepEqual(fake.appended, [{ type: "resource-rename", data: { tabName: "API Fix" } }]);
		assert.match(result.content[0].text, /current Herdr tab named/);
	});
});

test("a Herdr failure does not undo the Pi name or persist an alias", async () => {
	await withEnv({ HERDR_ENV: "1", HERDR_TAB_ID: "tab-current" }, async () => {
		const fake = makeFake();
		fake.nextExec = async () => ({ code: 1, stdout: "", stderr: "not found" });
		const result = await tool(fake).execute("call", { piName: "Build API", tabName: "API Fix" }, undefined, undefined, context());
		assert.deepEqual(fake.setNames, ["Build API"]);
		assert.deepEqual(fake.appended, []);
		assert.match(result.content[0].text, /was not renamed/);
	});
});

test("session_start restores only a default numeric current tab label", async () => {
	await withEnv({ HERDR_ENV: "1", HERDR_PANE_ID: "tab-current:pane" }, async () => {
		for (const label of ["7", "API Fix", "Manual Label"]) {
			const fake = makeFake();
			fake.nextExec = async (args) => {
				if (args[0] === "pane") {
					return { code: 0, stdout: JSON.stringify({ result: { pane: { tab_id: "tab-current" } } }), stderr: "" };
				}
				if (args[1] === "get") {
					return { code: 0, stdout: JSON.stringify({ result: { tab: { tab_id: "tab-current", label, number: 7 } } }), stderr: "" };
				}
				return { code: 0, stdout: "", stderr: "" };
			};
			await fake.handlers.session_start({}, context([{ type: "custom", customType: "resource-rename", data: { tabName: "API Fix" } }]));
			const reads = [["pane", "current", "--current"], ["tab", "get", "tab-current"]];
			assert.deepEqual(fake.execCalls, label === "7"
				? [...reads, ["tab", "rename", "tab-current", "API Fix"]]
				: reads);
		}
	});
});

test("/rename queues the normal naming pass and rejects arguments", async () => {
	await withEnv({ HERDR_ENV: "1" }, async () => {
		const fake = makeFake();
		await fake.commands.rename.handler("", context([], true));
		assert.equal(fake.messages.length, 1);
		assert.match(fake.messages[0]!.text, /name_session exactly once/);
		assert.match(fake.messages[0]!.text, /2-4 word/);

		const notifications: string[] = [];
		await fake.commands.rename.handler("pi Old Name", {
			...context(),
			ui: { notify: (message: string) => notifications.push(message) },
		});
		assert.deepEqual(notifications, ["Usage: /rename"]);
		assert.equal(fake.messages.length, 1);
	});
});
