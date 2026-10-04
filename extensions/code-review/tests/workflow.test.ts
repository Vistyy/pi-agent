import { execFile } from "node:child_process";
import { appendFile, chmod, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { SessionManager, SettingsManager, type AgentSessionRuntime, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { contentText, fauxAssistantMessage, fauxToolCall, getCurrentTools, type TranscriptContext, type JsonObject } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, expect, test } from "vitest";
import { Type } from "typebox";
import { links, pendingPreparation, readSession } from "../sessions.ts";
import { dispose, eventually, nativeSession } from "./native.ts";

const scopeInput = { title: "Source review", requirements: [], locations: [{ kind: "paths", paths: ["source.ts"] }] };

let root: string, cwd: string;
const owned: AgentSessionRuntime[] = [];
const execute = promisify(execFile);
const savedEnv = { HERDR_ENV: process.env.HERDR_ENV, HERDR_PANE_ID: process.env.HERDR_PANE_ID, HERDR_BIN_PATH: process.env.HERDR_BIN_PATH };
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "code-review-workflow-")); cwd = root;
	await execute("git", ["init", "-b", "main"], { cwd });
	await execute("git", ["config", "user.name", "Fixture"], { cwd });
	await execute("git", ["config", "user.email", "fixture@example.invalid"], { cwd });
	await writeFile(join(root, "source.ts"), "export const value = 1;\n");
	await execute("git", ["add", "source.ts"], { cwd }); await execute("git", ["commit", "-m", "Initial"], { cwd });
	const cli = join(root, "herdr-fixture.mjs");
	await writeFile(cli, `#!/usr/bin/env node
import { appendFileSync, existsSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(join(root, "herdr-calls.jsonl"))}, JSON.stringify(args) + '\\n');
let result;
if (args[0] === 'agent' && args[1] === 'list') result = { agents: [] };
else if (args[1] === 'current') result = { pane: { pane_id: 'author-pane' } };
else if (args[1] === 'layout') result = { layout: { area: { width: 180 } } };
else if (args[1] === 'split') {
  while (existsSync(${JSON.stringify(join(root, "hold-split"))})) await new Promise(resolve => setTimeout(resolve, 20));
  result = { pane: { pane_id: 'reviewer-pane' } };
}
else if (args[0] === 'pane' && args[1] === 'list') result = { panes: existsSync(${JSON.stringify(join(root, "pane-closed"))}) ? [] : [{ pane_id: 'reviewer-pane', agent: 'pi' }] };
else if (args[0] === 'agent' && args[1] === 'start') {
  while (existsSync(${JSON.stringify(join(root, "hold-startup"))})) await new Promise(resolve => setTimeout(resolve, 20));
  result = {};
}
else result = {};
console.log(JSON.stringify({ result }));
`);
	await chmod(cli, 0o700);
	process.env.HERDR_ENV = "1"; process.env.HERDR_PANE_ID = "author-pane"; process.env.HERDR_BIN_PATH = cli;
});
afterEach(async () => {
	for (const session of owned.splice(0)) await dispose(session);
	for (const [key, value] of Object.entries(savedEnv)) {
		if (value === undefined) delete process.env[key]; else process.env[key] = value;
	}
	await rm(root, { recursive: true, force: true });
});
const messages = (manager: SessionManager) => manager.getEntries().filter((entry) => entry.type === "custom_message").filter((entry) => entry.customType === "code-review.report");

async function author(settings?: SettingsManager, tools: string[] = [], extensions: ExtensionFactory[] = []) {
	const manager = SessionManager.create(cwd, join(root, "sessions"));
	const runtime = await nativeSession(root, cwd, manager, [
		fauxAssistantMessage("Author ready."), fauxAssistantMessage(fauxToolCall("start_review", scopeInput)),
		fauxAssistantMessage("Review started."), fauxAssistantMessage("Author assessed the returned report."),
	], { settings, tools, extensions }); owned.push(runtime.host);
	await runtime.session.prompt("AUTHOR_PRIVATE_CONTEXT must not reach the independent reviewer.");
	await runtime.session.prompt("/review source.ts");
	await eventually(() => links(manager.getEntries()).length === 1 && !runtime.session.isStreaming);
	const [link] = links(manager.getEntries());
	expect(link?.title).toBe("Source review");
	if (!link) throw new Error("Review command did not save a link.");
	return { ...runtime, manager, link };
}

test("the registered author command saves a fresh reviewer without forwarding author context", async () => {
	const started = await author();
	const entries = await readSession(started.link.reviewer);
	const content = await readFile(started.link.reviewer.file, "utf8");
	expect(content).not.toContain("AUTHOR_PRIVATE_CONTEXT");
	expect(started.manager.getEntries().find(entry => entry.type === "custom" && entry.customType === "code-review.link")).toMatchObject({ data: { reviewer: started.link.reviewer, title: "Source review" } });
	expect(entries.find(entry => entry.type === "custom" && entry.customType === "code-review.origin")).toMatchObject({ data: { author: { id: started.manager.getSessionId(), file: started.manager.getSessionFile() }, anchor: started.link.anchor } });
	expect(entries.filter((entry) => entry.type === "message" && entry.message.role === "user")).toHaveLength(1);
	expect(entries.filter((entry) => entry.type === "model_change" || entry.type === "thinking_level_change")).toEqual([]);
	expect(content).toContain("source.ts");
	expect(messages(started.manager)).toHaveLength(0);
	const calls = (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
	expect(calls.find((args: string[]) => args[1] === "split")).toEqual(["pane", "split", "--pane", "author-pane", "--direction", "right", "--cwd", cwd, "--env", `PI_CODING_AGENT_DIR=${process.env.PI_CODING_AGENT_DIR || join(process.env.HOME || "", ".pi", "agent")}`, "--no-focus"]);
	const start = calls.find((args: string[]) => args[1] === "start");
	expect(start).toContain(started.link.reviewer.file);
	expect(start).not.toContain("--model");
	expect(start).not.toContain("--thinking");
	expect(start.slice(start.indexOf("--exclude-tools"), start.indexOf("--exclude-tools") + 2)).toEqual(["--exclude-tools", "name_session,tuicr_review"]);
	expect(started.errors).toEqual([]);
});

test("reviewer settings select its model and thinking without copying the author", async () => {
	const settings = SettingsManager.fromStorage({ withLock(scope, read) {
		read(JSON.stringify(scope === "global" ? { packages: [], compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off", codeReview: { model: "review-provider/review-model", thinkingLevel: "high" } } : {}));
	} });
	const started = await author(settings);
	const entries = await readSession(started.link.reviewer);
	expect(entries.filter((entry) => entry.type === "model_change").map((entry) => ({ provider: entry.provider, modelId: entry.modelId }))).toEqual([{ provider: "review-provider", modelId: "review-model" }]);
	expect(entries.filter((entry) => entry.type === "thinking_level_change").map((entry) => entry.thinkingLevel)).toEqual(["high"]);
	const calls = (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
	const start = calls.find((args: string[]) => args[1] === "start");
	expect(start.slice(start.indexOf("--model") + 1, start.indexOf("--model") + 2)).toEqual(["review-provider/review-model"]);
	expect(start.slice(start.indexOf("--thinking") + 1, start.indexOf("--thinking") + 2)).toEqual(["high"]);
	expect(started.session.model?.id).toBe("fixture");
	expect(started.session.thinkingLevel).toBe("off");
});

test.each([
	{ codeReview: { model: "review-provider/review-model" }, model: [{ provider: "review-provider", modelId: "review-model" }], thinking: [] },
	{ codeReview: { thinkingLevel: "high" }, model: [], thinking: ["high"] },
])("each reviewer override leaves the other field to native defaults: %j", async ({ codeReview, model, thinking }) => {
	const settings = SettingsManager.fromStorage({ withLock(scope, read) {
		read(JSON.stringify(scope === "global" ? { packages: [], codeReview } : {}));
	} });
	const started = await author(settings);
	const entries = await readSession(started.link.reviewer);
	expect(entries.filter((entry) => entry.type === "model_change").map((entry) => ({ provider: entry.provider, modelId: entry.modelId }))).toEqual(model);
	expect(entries.filter((entry) => entry.type === "thinking_level_change").map((entry) => entry.thinkingLevel)).toEqual(thinking);
});

test("resuming preserves the reviewer's actual saved selection instead of applying its launch settings", async () => {
	const settings = SettingsManager.fromStorage({ withLock(scope, read) {
		read(JSON.stringify(scope === "global" ? { packages: [], compaction: { enabled: false }, retry: { enabled: false }, codeReview: { model: "review-provider/review-model", thinkingLevel: "high" } } : {}));
	} });
	const started = await author(settings);
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [fauxAssistantMessage("Discussion with the saved selection.")]); owned.push(peer.host);
	const model = peer.provider.getModel("saved-reviewer");
	if (!model) throw new Error("Missing fixture model.");
	await peer.session.setModel(model);
	expect(peer.modelSelections).toEqual(["saved-reviewer"]);
	peer.session.setThinkingLevel("low");
	await peer.session.prompt("Continue the discussion.");
	await dispose(peer.host); owned.splice(owned.indexOf(peer.host), 1);
	await started.session.prompt("/review resume");
	const calls = (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
	const start = calls.filter((args: string[]) => args[1] === "start").at(-1);
	expect(start.slice(start.indexOf("--model") + 1, start.indexOf("--model") + 2)).toEqual(["code-review-fixture/saved-reviewer"]);
	expect(start.slice(start.indexOf("--thinking") + 1, start.indexOf("--thinking") + 2)).toEqual(["low"]);
	expect(calls.filter((args: string[]) => args[1] === "prompt")).toHaveLength(1);
});

test.each([{ model: "not-qualified" }, { thinkingLevel: "invented" }, { typo: true }])("invalid reviewer settings do not save a link or start a process: %j", async (codeReview) => {
	const settings = SettingsManager.fromStorage({ withLock(scope, read) {
		read(JSON.stringify(scope === "global" ? { packages: [], codeReview } : {}));
	} });
	const manager = SessionManager.create(cwd, join(root, "sessions"));
	const runtime = await nativeSession(root, cwd, manager, [fauxAssistantMessage(fauxToolCall("start_review", scopeInput)), fauxAssistantMessage("Invalid settings must be corrected.")], { settings }); owned.push(runtime.host);
	await runtime.session.prompt("/review source.ts");
	await eventually(() => runtime.provider.state.callCount === 2 && !runtime.session.isStreaming);
	expect(links(manager.getEntries())).toEqual([]);
	await expect(readFile(join(root, "herdr-calls.jsonl"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
	expect(runtime.errors).toEqual([]);
});

test("new-review initialization applies native per-model defaults once and records the actual selection", async () => {
	const settings = SettingsManager.inMemory({ packages: [], defaultThinkingLevel: "medium", modelThinkingLevels: { "code-review-fixture/fixture": "low" }, compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off" });
	const started = await author(settings);
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [fauxAssistantMessage("Initial report with native defaults.")], { settings, initialize: true }); owned.push(peer.host);
	expect(peer.session.model?.id).toBe("fixture");
	expect(peer.session.thinkingLevel).toBe("low");
	expect(peer.modelSelections).toEqual([]);
	await peer.session.prompt("Start review.");
	peer.session.setThinkingLevel("high");
	await peer.session.reload();
	expect(peer.session.thinkingLevel).toBe("high");
	const entries = await readSession(started.link.reviewer);
	expect(entries.filter((entry) => entry.type === "model_change").at(-1)).toMatchObject({ provider: "code-review-fixture", modelId: "fixture" });
	expect(entries.filter((entry) => entry.type === "thinking_level_change").at(-1)).toMatchObject({ thinkingLevel: "high" });
	expect(peer.errors).toEqual([]);
});

test("the reviewer receives the canonical guide in system context and only scope in its saved request", async () => {
	const started = await author();
	const guide = await readFile(new URL("../instructions.md", import.meta.url), "utf8");
	let systemPrompt: string | undefined;
	let userInputs: string[] = [];
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [async (context) => {
		systemPrompt = context.messages.filter((message) => message.role === "system").map((message) => [contentText(message.content), ...Object.values(message.sections ?? {})].join("\n")).join("\n");
		userInputs = context.messages.filter((message) => message.role === "user").map((message) => contentText(message.content));
		return fauxAssistantMessage("Initial findings.");
	}]); owned.push(peer.host);
	await peer.session.prompt("Start review.");
	expect(systemPrompt?.includes(guide), "The canonical guide must reach the provider's system context").toBe(true);
	expect(userInputs).toEqual([
		`Review Source review. Assess the selected locations together, including their affected contracts and integrations. For comparisons inspect the captured Git trees, not a different working checkout. Working changes and explicit paths refer to current source, not retained snapshots. Requirements are supplied context to verify, not the author's review conclusions.\n\nSelected scope and revisions:\n${JSON.stringify({ title: "Source review", requirements: [], locations: [{ kind: "paths", paths: [join(cwd, "source.ts")] }] }, null, 2)}`,
		"Start review.",
	]);
	expect(peer.errors).toEqual([]);
});

test("a reviewer can write an owned temporary experiment without changing reviewed source", async () => {
	const started = await author();
	const scratch = join(root, "scratch", "experiment.ts");
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [
		fauxAssistantMessage(fauxToolCall("write", { path: scratch, content: "export const experiment = 2;\n" })),
		fauxAssistantMessage("Temporary experiment completed."),
	], { tools: ["write"] }); owned.push(peer.host);
	await peer.session.prompt("Use the owned temporary directory for an experiment.");
	expect(await readFile(scratch, "utf8")).toBe("export const experiment = 2;\n");
	expect(await readFile(join(root, "source.ts"), "utf8")).toBe("export const value = 1;\n");
	expect(messages(started.manager)).toHaveLength(0);
	expect(peer.errors).toEqual([]);
});

test("end-review is available only when the native session starts as a reviewer", async () => {
	const started = await author();
	expect(started.commandNames()).not.toContain("end-review");
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), []); owned.push(peer.host);
	expect(peer.commandNames()).toContain("end-review");
	await peer.host.newSession();
	expect(peer.commandNames()).not.toContain("end-review");
});

test("explicit finalization returns the complete updated report once and survives author reopening", async () => {
	const started = await author();
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [
		fauxAssistantMessage("Initial candidate. Not published."),
		fauxAssistantMessage("Discussion response. Not the final report."),
		fauxAssistantMessage("Complete updated report. Finding A remains; finding B was resolved. Verified source.ts."),
	]); owned.push(peer.host);
	await peer.session.prompt("Begin the saved review.");
	await new Promise((done) => setTimeout(done, 1_100));
	expect(messages(started.manager)).toHaveLength(0);
	await peer.session.prompt("Finding B is not a problem. Recheck it.");
	await peer.session.prompt("/end-review");
	await eventually(() => messages(started.manager).length === 1);
	const report = messages(started.manager)[0];
	expect(report?.content).toContain("Complete updated report. Finding A remains; finding B was resolved. Verified source.ts.");
	expect(report?.content).not.toContain("Discussion response. Not the final report.");
	await peer.session.prompt("/end-review");
	await new Promise((done) => setTimeout(done, 1_100));
	expect(messages(started.manager)).toHaveLength(1);
	const authorPath = started.manager.getSessionFile(); if (!authorPath) throw new Error("Missing author file");
	await dispose(started.host); owned.splice(owned.indexOf(started.host), 1);
	const reopened = await nativeSession(root, cwd, SessionManager.open(authorPath), []); owned.push(reopened.host);
	await new Promise((done) => setTimeout(done, 1_100));
	expect(reopened.session.sessionManager.getEntries().filter((entry) => entry.type === "custom_message" && entry.customType === "code-review.report")).toHaveLength(1);
	expect([...peer.errors, ...started.errors, ...reopened.errors]).toEqual([]);
});

test("a returned report automatically starts an idle author's assessment once", async () => {
	const started = await author();
	let received: string[] = [];
	started.provider.setResponses([async (context) => {
		received = context.messages.filter((message) => message.role === "user").map((message) => contentText(message.content));
		return fauxAssistantMessage("Author assessment began without a manual follow-up.");
	}]);
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [fauxAssistantMessage("Complete report for automatic assessment.")]); owned.push(peer.host);
	await peer.session.prompt("/end-review");
	await eventually(() => started.manager.getEntries().some((entry) => entry.type === "message" && entry.message.role === "assistant" && contentText(entry.message.content) === "Author assessment began without a manual follow-up."));
	expect(received.at(-1)).toContain("Complete report for automatic assessment.");
	expect(received.at(-1)).toContain("Evaluate this report against current code and the agreed task scope before acting on any finding.");
	await new Promise((done) => setTimeout(done, 2_100));
	expect(messages(started.manager)).toHaveLength(1);
	expect(started.provider.state.callCount).toBe(4);
	expect(started.errors).toEqual([]);
});

test("a report steers active tool work before the author settles", async () => {
	let release = () => {}, entered = () => {};
	const gate = new Promise<void>((done) => { release = done; });
	const busy = new Promise<void>((done) => { entered = done; });
	const started = await author(undefined, ["verification_read"], [pi => {
		pi.registerTool({
			name: "verification_read", label: "Read owned fixture", description: "Read an owned file after the execution gate is released.",
			parameters: Type.Object({ path: Type.String() }),
			async execute(_id, input, signal) {
				entered(); await gate; signal?.throwIfAborted();
				return { content: [{ type: "text", text: await readFile(input.path, "utf8") }], details: undefined };
			},
		});
	}]);
	let sawReportDuringWork = false;
	started.provider.setResponses([
		fauxAssistantMessage(fauxToolCall("verification_read", { path: join(root, "source.ts") })),
		async (context) => {
			sawReportDuringWork = context.messages.some((message) => message.role === "user" && contentText(message.content).includes("Complete report held while busy."));
			return fauxAssistantMessage("Author used the report while completing its read task.");
		},
	]);
	const running = started.session.prompt("Keep this author turn active.");
	try {
		await busy;
		const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [fauxAssistantMessage("Complete report held while busy.")]); owned.push(peer.host);
		await peer.session.prompt("/end-review");
		await eventually(async () => (await readFile(started.link.reviewer.file, "utf8")).includes('"customType":"code-review.finalized"'));
		await new Promise((done) => setTimeout(done, 1_100));
		expect(messages(started.manager)).toHaveLength(0);
		expect((await readFile(started.manager.getSessionFile() || "", "utf8"))).not.toContain('"customType":"code-review.report"');
	} finally { release(); }
	await running;
	await eventually(() => messages(started.manager).length === 1);
	expect(messages(started.manager)[0]?.content).toContain("Complete report held while busy.");
	expect(sawReportDuringWork).toBe(true);
	const entries = started.manager.getEntries();
	const resultIndex = entries.findIndex(entry => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "verification_read" && !entry.message.isError && contentText(entry.message.content) === "export const value = 1;\n");
	const assessmentIndex = entries.findIndex(entry => entry.type === "message" && entry.message.role === "assistant" && contentText(entry.message.content) === "Author used the report while completing its read task.");
	expect(resultIndex).toBeGreaterThan(-1);
	expect(assessmentIndex).toBeGreaterThan(resultIndex);
	expect(started.provider.state.callCount).toBe(5);
	expect(started.errors).toEqual([]);
});

test("a steered report is assessed once before an already queued user follow-up",  async () => {
	const started = await author();
	let release = () => {}, entered = () => {};
	const gate = new Promise<void>((done) => { release = done; });
	const busy = new Promise<void>((done) => { entered = done; });
	let reportsInFollowUp = 0;
	started.provider.setResponses([
		async () => { entered(); await gate; return fauxAssistantMessage("Author's initial response completed."); },
		async (context) => {
			expect(context.messages.some((message) => message.role === "user" && contentText(message.content) === "A supported queued follow-up.")).toBe(false);
			return fauxAssistantMessage("Author assessed the steered report.");
		},
		async (context) => {
			reportsInFollowUp = context.messages.filter((message) => message.role === "user" && contentText(message.content).includes("Report queued at the native turn boundary.")).length;
			return fauxAssistantMessage("The requested follow-up completed.");
		},
	]);
	const running = started.session.prompt("Keep the author active."); await busy;
	await started.session.prompt("A supported queued follow-up.", { streamingBehavior: "followUp" });
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [fauxAssistantMessage("Report queued at the native turn boundary.")]); owned.push(peer.host);
	await peer.session.prompt("/end-review");
	await eventually(async () => (await readFile(started.link.reviewer.file, "utf8")).includes('"customType":"code-review.finalized"'));
	await new Promise((done) => setTimeout(done, 3_100));
	expect(messages(started.manager)).toHaveLength(0);
	release(); await running;
	expect(reportsInFollowUp).toBe(1);
	expect(messages(started.manager)).toHaveLength(1);
	expect(started.manager.getEntries().flatMap((entry) => entry.type === "message" && entry.message.role === "assistant" ? [contentText(entry.message.content)] : []).filter(Boolean)).toEqual(["Author ready.", "Review started.", "Author's initial response completed.", "Author assessed the steered report.", "The requested follow-up completed."]);
});

test("a queued discussion reply cannot replace the requested complete final report", async () => {
	const started = await author();
	let release = () => {}, entered = () => {};
	const gate = new Promise<void>((done) => { release = done; });
	const busy = new Promise<void>((done) => { entered = done; });
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [
		async () => { entered(); await gate; return fauxAssistantMessage("Complete report before the queued clarification."); },
		fauxAssistantMessage("A discussion reply only, not a complete report."),
		fauxAssistantMessage("Complete updated report including the clarification."),
	]); owned.push(peer.host);
	await peer.session.prompt("/end-review"); await busy;
	await peer.session.prompt("One more clarification while you finalize.", { streamingBehavior: "followUp" });
	release();
	await eventually(() => !peer.session.isStreaming && peer.session.pendingMessageCount === 0);
	await new Promise((done) => setTimeout(done, 1_100));
	expect(messages(started.manager)).toHaveLength(0);
	await peer.session.prompt("/end-review");
	await eventually(() => messages(started.manager).length === 1);
	expect(messages(started.manager)[0]?.content).toContain("Complete updated report including the clarification.");
	expect(messages(started.manager)[0]?.content).not.toContain("A discussion reply only");
	expect(peer.errors).toEqual([]);
});

test("saved-session resume reopens the same conversation without starting a new review", async () => {
	const started = await author();
	await started.session.prompt("/review resume");
	const calls = (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
	const starts = calls.filter((args: string[]) => args[1] === "start");
	expect(starts).toHaveLength(2);
	for (const start of starts) expect(start.slice(start.indexOf("--exclude-tools"), start.indexOf("--exclude-tools") + 2)).toEqual(["--exclude-tools", "name_session,tuicr_review"]);
	expect(starts[0]).toContain(started.link.reviewer.file);
	expect(starts[1]).toContain(started.link.reviewer.file);
	expect(calls.filter((args: string[]) => args[1] === "prompt")).toEqual([["agent", "prompt", "reviewer-pane", "Start review."]]);
	expect(calls.filter((args: string[]) => args[1] === "focus")).toEqual([["agent", "focus", "reviewer-pane"]]);
	expect(links(started.manager.getEntries())).toHaveLength(1);
});

test("explicit resume focuses the reviewer before interactive startup completes", async () => {
	const started = await author();
	await writeFile(join(root, "herdr-calls.jsonl"), "");
	await writeFile(join(root, "hold-startup"), "");
	let settled = false;
	const resume = started.session.prompt(`/review resume ${started.link.anchor}`).then(() => { settled = true; });
	try {
		await eventually(async () => (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).includes('["agent","focus","reviewer-pane"]'), 1_000);
		expect(settled).toBe(false);
	} finally {
		await unlink(join(root, "hold-startup"));
		await resume;
	}
});

test("closing during startup releases the command so the same saved reviewer can reopen", async () => {
	const started = await author();
	await writeFile(join(root, "herdr-calls.jsonl"), "");
	await writeFile(join(root, "hold-startup"), "");
	const resume = started.session.prompt(`/review resume ${started.link.anchor}`);
	try {
		await eventually(async () => (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).includes('["agent","start"'));
		await writeFile(join(root, "pane-closed"), "");
		expect(await Promise.race([resume.then(() => "finished"), new Promise(resolve => setTimeout(() => resolve("still waiting"), 1_000))])).toBe("finished");
	} finally {
		await unlink(join(root, "hold-startup"));
		await resume;
		await unlink(join(root, "pane-closed"));
	}
	await started.session.prompt(`/review resume ${started.link.anchor}`);
	const calls = (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
	expect(calls.filter((args: string[]) => args[0] === "agent" && args[1] === "start")).toHaveLength(2);
	expect(links(started.manager.getEntries())).toHaveLength(1);
	expect(started.errors).toEqual([]);
});

test("resume during initial launch opens one writer and requests focus on that opening", async () => {
	const manager = SessionManager.create(cwd, join(root, "sessions"));
	const runtime = await nativeSession(root, cwd, manager, [fauxAssistantMessage(fauxToolCall("start_review", scopeInput)), fauxAssistantMessage("Review started.")]); owned.push(runtime.host);
	await writeFile(join(root, "herdr-calls.jsonl"), "");
	await writeFile(join(root, "hold-split"), "");
	let resumed: Promise<void> | undefined;
	try {
		await runtime.session.prompt("/review source.ts");
		await eventually(async () => links(manager.getEntries()).length === 1 && (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).includes('["pane","split"'));
		const [link] = links(manager.getEntries());
		if (!link) throw new Error("Missing saved reviewer.");
		resumed = runtime.session.prompt(`/review resume ${link.anchor}`);
		await new Promise(resolve => setTimeout(resolve, 200));
	} finally { await unlink(join(root, "hold-split")); }
	await resumed;
	await eventually(() => !runtime.session.isStreaming);
	const [link] = links(manager.getEntries());
	if (!link) throw new Error("Missing saved reviewer.");
	const calls = (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
	const starts = calls.filter((args: string[]) => args[0] === "agent" && args[1] === "start");
	expect(starts).toHaveLength(1);
	expect(starts[0]).toContain(link.reviewer.file);
	expect(calls.filter((args: string[]) => args[0] === "agent" && args[1] === "focus")).toEqual([["agent", "focus", "reviewer-pane"]]);
	expect(calls.filter((args: string[]) => args[0] === "agent" && args[1] === "prompt")).toEqual([["agent", "prompt", "reviewer-pane", "Start review."]]);
	expect(links(manager.getEntries())).toHaveLength(1);
	expect(runtime.errors).toEqual([]);
});

test("concurrent resume commands open only one reviewer", async () => {
	const started = await author();
	await writeFile(join(root, "herdr-calls.jsonl"), "");
	await Promise.all([started.session.prompt("/review resume"), started.session.prompt("/review resume")]);
	const calls = (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
	expect(calls.filter((args: string[]) => args[0] === "agent" && args[1] === "start")).toHaveLength(1);
});

test("author reload restores links and does not replay a received report", async () => {
	const started = await author();
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [fauxAssistantMessage("Final report before reload.")]); owned.push(peer.host);
	await peer.session.prompt("/end-review");
	await eventually(() => messages(started.manager).length === 1);
	await started.session.reload();
	await new Promise((done) => setTimeout(done, 1_100));
	expect(messages(started.manager)).toHaveLength(1);
	await started.session.prompt("/review resume");
	expect(links(started.manager.getEntries())).toHaveLength(1);
	expect(started.errors).toEqual([]);
});

test("an abandoned author branch holds the report until its launch anchor is restored", async () => {
	const started = await author();
	const earlier = started.manager.getEntries().find((entry) => entry.type === "message" && entry.message.role === "user");
	if (!earlier) throw new Error("Missing earlier conversation point");
	await started.session.navigateTree(earlier.id);
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [fauxAssistantMessage("Report for the original author branch.")]); owned.push(peer.host);
	await peer.session.prompt("/end-review");
	await eventually(async () => (await readFile(started.link.reviewer.file, "utf8")).includes('"customType":"code-review.finalized"'));
	await new Promise((done) => setTimeout(done, 1_100));
	expect(messages(started.manager)).toHaveLength(0);
	await started.session.navigateTree(started.link.anchor);
	await eventually(() => messages(started.manager).length === 1);
	expect(messages(started.manager)[0]?.content).toContain("Report for the original author branch.");
});

test("switching author sessions never redirects a pending report", async () => {
	const started = await author();
	const original = started.manager.getSessionFile(); if (!original) throw new Error("Missing original session");
	await started.host.newSession();
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [fauxAssistantMessage("Report for the captured author session only.")]); owned.push(peer.host);
	await peer.session.prompt("/end-review");
	await eventually(async () => (await readFile(started.link.reviewer.file, "utf8")).includes('"customType":"code-review.finalized"'));
	await new Promise((done) => setTimeout(done, 1_100));
	expect(started.host.session.sessionManager.getEntries().filter((entry) => entry.type === "custom_message" && entry.customType === "code-review.report")).toHaveLength(0);
	expect(await readFile(original, "utf8")).not.toContain('"customType":"code-review.report"');
	await started.host.switchSession(original);
	await eventually(() => started.host.session.sessionManager.getEntries().some((entry) => entry.type === "custom_message" && entry.customType === "code-review.report"));
	expect(started.host.session.sessionManager.getEntries().filter((entry) => entry.type === "custom_message" && entry.customType === "code-review.report")).toHaveLength(1);
	expect(started.errors).toEqual([]);
});

test("a failed final response is not published and can be retried", async () => {
	const started = await author();
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [
		fauxAssistantMessage("Incomplete result.", { stopReason: "length" }), fauxAssistantMessage("Successful complete retry."),
	]); owned.push(peer.host);
	await peer.session.prompt("/end-review");
	await eventually(async () => (await readFile(started.link.reviewer.file, "utf8")).includes('"customType":"code-review.finalize-failed"'));
	await new Promise((done) => setTimeout(done, 1_100));
	expect(messages(started.manager)).toHaveLength(0);
	await peer.session.prompt("/end-review");
	await eventually(() => messages(started.manager).length === 1);
	expect(messages(started.manager)[0]?.content).toContain("Successful complete retry.");
});

test("resuming an interrupted finalization does not publish the next discussion reply", async () => {
	const started = await author();
	// The stopped reviewer persisted its request before its response settled.
	SessionManager.open(started.link.reviewer.file).appendCustomEntry("code-review.finalize-request", {});
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [fauxAssistantMessage("A resumed discussion reply, not a final report."), fauxAssistantMessage("Explicit complete report after resumption.")]); owned.push(peer.host);
	await peer.session.prompt("Can you explain the first concern?");
	await new Promise((done) => setTimeout(done, 1_100));
	expect(messages(started.manager)).toHaveLength(0);
	await peer.session.prompt("/end-review");
	await eventually(() => messages(started.manager).length === 1);
	expect(messages(started.manager)[0]?.content).toContain("Explicit complete report after resumption.");
	expect(messages(started.manager)[0]?.content).not.toContain("A resumed discussion reply");
});

test("tree navigation cannot turn a discussion reply into a new final report", async () => {
	const started = await author();
	const manager = SessionManager.open(started.link.reviewer.file);
	const peer = await nativeSession(root, cwd, manager, [
		fauxAssistantMessage("Complete initial report."), fauxAssistantMessage("Only a discussion reply, NOT the report."),
		fauxAssistantMessage("Complete updated report after a fresh request."),
	]); owned.push(peer.host);
	await peer.session.prompt("/end-review");
	await eventually(() => messages(started.manager).length === 1);
	const request = manager.getEntries().find(entry => entry.type === "custom" && entry.customType === "code-review.finalize-request");
	if (!request) throw new Error("Missing finalization request.");
	await peer.session.navigateTree(request.id);
	await peer.session.prompt("Explain this concern without returning another report.");
	expect(manager.getEntries().filter(entry => entry.type === "custom" && entry.customType === "code-review.finalized")).toHaveLength(1);
	expect(manager.getBranch()).toContainEqual(expect.objectContaining({ type: "custom", customType: "code-review.finalize-failed", data: { requestId: request.id } }));
	started.provider.setResponses([fauxAssistantMessage("Author assessed the updated report.")]);
	await peer.session.prompt("/end-review");
	await eventually(() => messages(started.manager).length === 2);
	expect(messages(started.manager)[1]?.content).toContain("Complete updated report after a fresh request.");
	expect(messages(started.manager)[1]?.content).not.toContain("Only a discussion reply");
	expect([...peer.errors, ...started.errors]).toEqual([]);
});

test("a missing older reviewer does not block another review's report", async () => {
	const started = await author();
	await unlink(started.link.reviewer.file);
	started.provider.setResponses([fauxAssistantMessage(fauxToolCall("start_review", scopeInput)), fauxAssistantMessage("Another review started."), fauxAssistantMessage("Author assessment completed.")]);
	await started.session.prompt("/review source.ts");
	await eventually(() => links(started.manager.getEntries()).length === 2 && !started.session.isStreaming);
	const latest = links(started.manager.getEntries()).at(-1);
	if (!latest) throw new Error("Missing new reviewer link");
	const peer = await nativeSession(root, cwd, SessionManager.open(latest.reviewer.file), [fauxAssistantMessage("Report despite missing earlier session.")]); owned.push(peer.host);
	await peer.session.prompt("/end-review");
	await eventually(() => messages(started.manager).length === 1);
	expect(messages(started.manager)[0]?.content).toContain("Report despite missing earlier session.");
});

test("a partial trailing line is never consumed or repaired by a live session reader", async () => {
	const started = await author();
	await appendFile(started.link.reviewer.file, '{"type":"custom","customType":"code-review.finalized"');
	const before = await readFile(started.link.reviewer.file, "utf8");
	const parsed = await readSession(started.link.reviewer);
	expect(parsed.filter((entry) => entry.type === "custom" && entry.customType === "code-review.finalized")).toHaveLength(0);
	expect(await readFile(started.link.reviewer.file, "utf8")).toBe(before);
});

test("the native launch tool captures two repositories and a non-Git file from a non-Git author directory", async () => {
	const payments = join(root, "payments"), orders = join(root, "orders");
	await mkdir(payments); await mkdir(orders);
	await writeFile(join(payments, "source.ts"), "export const value = 1;\n");
	await rename(join(root, ".git"), join(payments, ".git"));
	for (const args of [["init", "-b", "main"], ["config", "user.name", "Fixture"], ["config", "user.email", "fixture@example.invalid"]]) await execute("git", args, { cwd: orders });
	await writeFile(join(orders, "contract.ts"), "export const value = 1;\n");
	await execute("git", ["add", "."], { cwd: orders }); await execute("git", ["commit", "-m", "Initial"], { cwd: orders });
	const paymentHead = (await execute("git", ["rev-parse", "HEAD"], { cwd: payments })).stdout.trim();
	const orderHead = (await execute("git", ["rev-parse", "HEAD"], { cwd: orders })).stdout.trim();
	await writeFile(join(payments, "source.ts"), "export const value = 2;\n");
	await writeFile(join(orders, "contract.ts"), "export const value = 2;\n");
	await writeFile(join(root, "shared.json"), '{"value":2}\n');
	const input: JsonObject = { title: "Shared contract", requirements: ["Both services use the same value."], locations: [
		{ kind: "changes", repo: "payments", paths: ["source.ts"] }, { kind: "changes", repo: "orders" }, { kind: "paths", paths: ["shared.json"] },
	] };
	const manager = SessionManager.create(root, join(root, "sessions"));
	const runtime = await nativeSession(root, root, manager, [fauxAssistantMessage("Private author reasoning."), fauxAssistantMessage(fauxToolCall("start_review", input)), fauxAssistantMessage("Review started.")]); owned.push(runtime.host);
	await runtime.session.prompt("AUTHOR_PRIVATE_CONTEXT and AUTHOR_REVIEW_CONCLUSION must stay here.");
	await runtime.session.prompt("/review Check both service changes and shared.json together.");
	await eventually(() => links(manager.getEntries()).length === 1 && !runtime.session.isStreaming);
	const link = links(manager.getEntries())[0]; if (!link) throw new Error("Missing review link");
	const seed = (await readSession(link.reviewer)).find(entry => entry.type === "message" && entry.message.role === "user");
	if (!seed || seed.type !== "message" || seed.message.role !== "user") throw new Error("Missing factual seed");
	const text = contentText(seed.message.content);
	expect(JSON.parse(text.split("Selected scope and revisions:\n")[1] || "")).toEqual({ title: "Shared contract", requirements: ["Both services use the same value."], locations: [
		{ kind: "changes", repo: payments, head: paymentHead, files: ["source.ts"] },
		{ kind: "changes", repo: orders, head: orderHead, files: ["contract.ts"] },
		{ kind: "paths", paths: [join(root, "shared.json")] },
	] });
	expect(await readFile(link.reviewer.file, "utf8")).not.toContain("AUTHOR_PRIVATE_CONTEXT");
	expect(await readFile(link.reviewer.file, "utf8")).not.toContain("AUTHOR_REVIEW_CONCLUSION");
	expect(runtime.session.getActiveToolNames()).not.toContain("start_review");
	expect(pendingPreparation(manager.getBranch())).toBeUndefined();
	expect(runtime.errors).toEqual([]);
});

test("scope clarification happens in the author conversation before the fresh reviewer is created", async () => {
	const manager = SessionManager.create(cwd, join(root, "sessions"));
	const contexts: TranscriptContext[] = [];
	const runtime = await nativeSession(root, cwd, manager, [
		async context => { contexts.push(context); return fauxAssistantMessage("Should source.ts be the whole scope?"); },
		async context => { contexts.push(context); return fauxAssistantMessage(fauxToolCall("start_review", scopeInput)); },
		async context => { contexts.push(context); return fauxAssistantMessage("The independent review is ready."); },
	]); owned.push(runtime.host);
	await runtime.session.prompt("/review");
	await eventually(() => runtime.provider.state.callCount === 1 && !runtime.session.isStreaming);
	expect(links(manager.getEntries())).toEqual([]);
	expect(runtime.session.getActiveToolNames()).toContain("start_review");
	await runtime.session.prompt("Yes. Review source.ts only.");
	expect(links(manager.getEntries())).toHaveLength(1);
	expect(contexts.map(context => getCurrentTools(context.messages).some(tool => tool.name === "start_review"))).toEqual([true, true, false]);
	const link = links(manager.getEntries())[0]; if (!link) throw new Error("Missing reviewer");
	expect(await readFile(link.reviewer.file, "utf8")).not.toContain("Should source.ts be the whole scope?");
});

test("pending preparation survives reload without a model turn and can then be launched", async () => {
	const manager = SessionManager.create(cwd, join(root, "sessions"));
	const runtime = await nativeSession(root, cwd, manager, [fauxAssistantMessage("What scope should I submit?")]); owned.push(runtime.host);
	await runtime.session.prompt("/review Clarify the intended files.");
	await eventually(() => runtime.provider.state.callCount === 1 && !runtime.session.isStreaming);
	const pending = pendingPreparation(manager.getBranch()); expect(pending).toBeTruthy();
	await runtime.session.reload();
	expect(runtime.provider.state.callCount).toBe(1);
	expect(pendingPreparation(manager.getBranch())).toBe(pending);
	expect(runtime.session.getActiveToolNames()).toContain("start_review");
	runtime.provider.setResponses([fauxAssistantMessage(fauxToolCall("start_review", scopeInput)), fauxAssistantMessage("Launched after reload.")]);
	await runtime.session.prompt("Review source.ts only.");
	expect(links(manager.getEntries())).toHaveLength(1);
	expect(pendingPreparation(manager.getBranch())).toBeUndefined();
	expect(runtime.errors).toEqual([]);
});

test("cancellation withdraws the declaration, starts no reviewer and stays cancelled after reload", async () => {
	const manager = SessionManager.create(cwd, join(root, "sessions"));
	let normalTools: string[] = [];
	const runtime = await nativeSession(root, cwd, manager, [fauxAssistantMessage("Please clarify the scope."), async context => {
		normalTools = getCurrentTools(context.messages).map(tool => tool.name); return fauxAssistantMessage("Normal work continued.");
	}]); owned.push(runtime.host);
	await runtime.session.prompt("/review"); await eventually(() => runtime.provider.state.callCount === 1 && !runtime.session.isStreaming);
	await runtime.session.prompt("/review cancel"); await runtime.session.reload();
	expect(runtime.provider.state.callCount).toBe(1);
	expect(pendingPreparation(manager.getBranch())).toBeUndefined();
	expect(runtime.session.getActiveToolNames()).not.toContain("start_review");
	await runtime.session.prompt("Continue normal work.");
	expect(normalTools).toEqual(["read", "bash", "edit", "write"]);
	expect(links(manager.getEntries())).toEqual([]);
});

test("duplicate calls in one model response create only one saved reviewer", async () => {
	const manager = SessionManager.create(cwd, join(root, "sessions"));
	const runtime = await nativeSession(root, cwd, manager, [
		fauxAssistantMessage([fauxToolCall("start_review", scopeInput), fauxToolCall("start_review", scopeInput)]), fauxAssistantMessage("One review exists."),
	]); owned.push(runtime.host);
	await runtime.session.prompt("/review source.ts");
	await eventually(() => runtime.provider.state.callCount === 2 && !runtime.session.isStreaming);
	expect(links(manager.getEntries())).toHaveLength(1);
	const calls = (await readFile(join(root, "herdr-calls.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
	expect(calls.filter((args: string[]) => args[0] === "agent" && args[1] === "start")).toHaveLength(1);
	expect(runtime.session.getActiveToolNames()).not.toContain("start_review");
});

test("unsupported author models do not begin preparation or make a model request", async () => {
	const manager = SessionManager.create(cwd, join(root, "sessions"));
	const runtime = await nativeSession(root, cwd, manager, [], { cacheSafe: false }); owned.push(runtime.host);
	await runtime.session.prompt("/review source.ts");
	expect(runtime.provider.state.callCount).toBe(0);
	expect(pendingPreparation(manager.getBranch())).toBeUndefined();
	expect(links(manager.getEntries())).toEqual([]);
	expect(runtime.session.getActiveToolNames()).not.toContain("start_review");
});

test("unrelated tool removals block preparation instead of moving its schema into the leading definitions", async () => {
	const manager = SessionManager.create(cwd, join(root, "sessions"));
	const runtime = await nativeSession(root, cwd, manager, [fauxAssistantMessage("Normal work.")]); owned.push(runtime.host);
	await runtime.session.prompt("Normal work.");
	manager.appendMessage({ role: "system", content: "", timestamp: Date.now(), toolsRemoved: [{ name: "read" }] });
	await runtime.session.prompt("/review source.ts");
	expect(runtime.provider.state.callCount).toBe(1);
	expect(pendingPreparation(manager.getBranch())).toBeUndefined();
	expect(links(manager.getEntries())).toEqual([]);
});

test("saved origins with extra scope metadata still resume and finalize without rewriting that metadata", async () => {
	const started = await author();
	const oldScope = { kind: "paths", head: (await execute("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim(), paths: ["source.ts"] };
	SessionManager.open(started.link.reviewer.file).appendCustomEntry("code-review.origin", { author: { id: started.manager.getSessionId(), file: started.manager.getSessionFile() }, anchor: started.link.anchor, repo: cwd, target: oldScope });
	await started.session.prompt("/review resume");
	const peer = await nativeSession(root, cwd, SessionManager.open(started.link.reviewer.file), [fauxAssistantMessage("Report from the saved origin.")]); owned.push(peer.host);
	await peer.session.prompt("/end-review");
	await eventually(() => messages(started.manager).length === 1);
	expect(messages(started.manager)[0]?.content).toContain("Report from the saved origin.");
	expect(await readFile(started.link.reviewer.file, "utf8")).toContain(JSON.stringify(oldScope));
	expect([...peer.errors, ...started.errors]).toEqual([]);
});
