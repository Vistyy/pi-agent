import assert from "node:assert/strict";
import test from "node:test";

import {
	applyPiRename,
	decideAutomaticPiRename,
	decideAutomaticTabRename,
	dispatchRenameCommand,
	HERDR_RENAME_TARGETS,
	parseRenameCommand,
	RESOURCE_RENAME_ENTRY,
	restoreSessionResourceState,
	validateRenameRequest,
	type SessionResourceState,
} from "./logic.ts";

const custom = (customType: string, data: unknown) => ({
	type: "custom",
	customType,
	data,
});

const resource = (data: unknown) => custom(RESOURCE_RENAME_ENTRY, data);
const oldExtensionEntry = (data: unknown) => custom("herdr-rename", data);

const baselineData = (runId: string, label = "My Custom Tab") => ({
	kind: "baseline",
	sessionId: "session-a",
	runId,
	tabId: "tab-1",
	workspaceId: "workspace-1",
	label,
});

const automaticPiData = (name: string, sessionId = "session-a") => ({
	kind: "automatic-name",
	sessionId,
	target: "pi",
	name,
});

const automaticTabData = (name: string, runId: string, sessionId = "session-a") => ({
	kind: "automatic-name",
	sessionId,
	target: "tab",
	runId,
	tabId: "tab-1",
	workspaceId: "workspace-1",
	name,
});

function stateWithBaseline(): SessionResourceState {
	return restoreSessionResourceState(
		[resource(baselineData("run-1"))],
		"session-a",
		"tab-1",
		"workspace-1",
	);
}

test("a descriptive label present at the occupancy baseline is eligible for automatic tab naming", () => {
	assert.equal(decideAutomaticTabRename(stateWithBaseline(), "My Custom Tab", "Build API"), "rename");
});

test("a label changed after the occupancy baseline is not automatically overwritten", () => {
	assert.equal(decideAutomaticTabRename(stateWithBaseline(), "User Current Name", "Build API"), "label-changed");
});

test("an automatic tab name may be refined while the live label still equals the last automatic name", () => {
	const state = {
		...stateWithBaseline(),
		lastAutomaticTabName: "Build API",
	};

	assert.equal(decideAutomaticTabRename(state, "Build API", "Fix API"), "rename");
});

test("a user-changed tab label blocks automatic refinement independently", () => {
	const state = {
		...stateWithBaseline(),
		lastAutomaticTabName: "Build API",
	};

	assert.equal(decideAutomaticTabRename(state, "User Chosen", "Fix API"), "label-changed");
});

test("an initial same-name tab request does not claim the baseline label", () => {
	const state = stateWithBaseline();

	assert.equal(decideAutomaticTabRename(state, state.baseline?.label ?? "", state.baseline?.label ?? ""), "same-name");
	assert.deepEqual(state, stateWithBaseline());
	assert.equal(decideAutomaticTabRename(state, state.baseline?.label ?? "", "Build API"), "rename");
});

test("the same automatic tab name is a no-op", () => {
	const state = {
		...stateWithBaseline(),
		lastAutomaticTabName: "Build API",
	};

	assert.equal(decideAutomaticTabRename(state, "Build API", "Build API"), "same-name");
});

test("a same-occupancy reload restores generic automatic names", () => {
	const state = restoreSessionResourceState(
		[
			resource(baselineData("run-1")),
			resource(automaticPiData("Implement resource naming")),
			resource(automaticTabData("Build API", "run-1")),
		],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.baseline?.runId, "run-1");
	assert.equal(state.lastAutomaticPiName, "Implement resource naming");
	assert.equal(state.lastAutomaticTabName, "Build API");
});

test("a new occupancy restores the newest baseline and resets its tab automatic name", () => {
	const state = restoreSessionResourceState(
		[
			resource(baselineData("run-1")),
			resource(automaticPiData("Implement resource naming")),
			resource(automaticTabData("Build API", "run-1")),
			resource(baselineData("run-2", "Build API")),
		],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.baseline?.runId, "run-2");
	assert.equal(state.lastAutomaticPiName, "Implement resource naming");
	assert.equal(state.lastAutomaticTabName, undefined);
	assert.equal(decideAutomaticTabRename(state, "Build API", "Fix API"), "rename");
});

test("a tab state from an older occupancy does not suppress the newer baseline", () => {
	const state = restoreSessionResourceState(
		[
			resource(baselineData("run-1")),
			resource(baselineData("run-2", "Build API")),
			resource(automaticTabData("Old Name", "run-1")),
		],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.baseline?.runId, "run-2");
	assert.equal(state.lastAutomaticTabName, undefined);
});

test("state from another session or tab does not suppress the current occupancy", () => {
	const state = restoreSessionResourceState(
		[
			resource(baselineData("run-1", "Current Tab")),
			resource(automaticPiData("Other session", "session-b")),
			resource(automaticTabData("Other tab", "run-1", "session-b")),
		],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.lastAutomaticPiName, undefined);
	assert.equal(state.lastAutomaticTabName, undefined);
});

test("malformed generic state fails closed", () => {
	const state = restoreSessionResourceState(
		[
			resource({ kind: "baseline", sessionId: "session-a", tabId: "tab-1", workspaceId: "workspace-1", label: "Current Tab" }),
			resource({ kind: "automatic-name", sessionId: "session-a", target: "tab", name: "Unsafe" }),
		],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.baseline, undefined);
	assert.equal(state.lastAutomaticTabName, undefined);
	assert.equal(decideAutomaticTabRename(state, "Current Tab", "New Name"), "baseline-unavailable");
});

test("old extension entries are not restored during migration", () => {
	const state = restoreSessionResourceState(
		[
			oldExtensionEntry(baselineData("old-run")),
			oldExtensionEntry(automaticPiData("Old Pi Name")),
			oldExtensionEntry(automaticTabData("Old Tab Name", "old-run")),
		],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.baseline, undefined);
	assert.equal(state.lastAutomaticPiName, undefined);
	assert.equal(state.lastAutomaticTabName, undefined);
});

test("automatic Pi naming sets an initially empty display name and no other side effect", () => {
	let currentName: string | undefined;
	const setNames: string[] = [];
	const result = applyPiRename(
		{
			getSessionName: () => currentName,
			setSessionName: (name) => {
				setNames.push(name);
				currentName = name;
			},
		},
		"Implement resource naming",
		false,
	);

	assert.deepEqual(result, { decision: "rename", name: "Implement resource naming" });
	assert.deepEqual(setNames, ["Implement resource naming"]);
});

test("automatic Pi naming preserves a live name that was not recorded automatically", () => {
	let setCount = 0;
	const result = applyPiRename(
		{
			getSessionName: () => "User chosen",
			setSessionName: () => setCount++,
		},
		"Implement resource naming",
		false,
	);

	assert.equal(result.decision, "live-name-changed");
	assert.equal(setCount, 0);
});

test("automatic Pi naming refines only its last automatic name", () => {
	let setName: string | undefined;
	const result = applyPiRename(
		{
			getSessionName: () => "Old automatic name",
			setSessionName: (name) => {
				setName = name;
			},
		},
		"New automatic name",
		false,
		"Old automatic name",
	);

	assert.equal(result.decision, "rename");
	assert.equal(setName, "New automatic name");
});

test("automatic Pi naming treats the same automatic name as a no-op", () => {
	let setCount = 0;
	const result = applyPiRename(
		{
			getSessionName: () => "Implement resource naming",
			setSessionName: () => setCount++,
		},
		"Implement resource naming",
		false,
		"Implement resource naming",
	);

	assert.equal(result.decision, "same-name");
	assert.equal(setCount, 0);
});

test("automatic Pi naming blocks a live name changed after the automatic name", () => {
	assert.equal(
		decideAutomaticPiRename("User chosen", "Old automatic name", "New automatic name"),
		"live-name-changed",
	);
});

test("explicit Pi naming uses the requested name even when another name exists", () => {
	let setName: string | undefined;
	const result = applyPiRename(
		{
			getSessionName: () => "Existing name",
			setSessionName: (name) => {
				setName = name;
			},
		},
		"User requested name",
		true,
	);

	assert.equal(result.decision, "rename");
	assert.equal(setName, "User requested name");
});

test("automatic combination validation requires independent normal flows", () => {
	assert.equal(validateRenameRequest({}, false).valid, false);
	const normalized = validateRenameRequest({ piName: " Task ", mode: undefined }, false);
	assert.deepEqual(normalized, { valid: true, request: { piName: "Task", herdr: undefined, mode: "automatic" } });
	assert.equal(validateRenameRequest({ piName: "Task" }, false).valid, true);
	assert.equal(validateRenameRequest({ herdr: { target: "tab", name: "Task" } }, false).valid, false);
	assert.equal(validateRenameRequest({ piName: "Task", herdr: { target: "tab", name: "Task" } }, false).valid, false);
	const identicalAutomaticPair = validateRenameRequest({
		piName: " Task ",
		herdr: { target: "tab", name: "Task" },
	}, true);
	assert.deepEqual(identicalAutomaticPair, {
		valid: false,
		error: "Automatic piName and Herdr tab name must be distinct after trimming.",
	});
	assert.equal(validateRenameRequest({ piName: "Task", herdr: { target: "tab", name: "Compact" } }, true).valid, true);
	assert.equal(validateRenameRequest({ piName: "Task" }, true).valid, false);
	assert.equal(validateRenameRequest({ herdr: { target: "tab", name: "Task" } }, true).valid, false);
	assert.equal(validateRenameRequest({ piName: "Task", herdr: { target: "workspace", name: "Task" } }, true).valid, false);
	assert.equal(validateRenameRequest({ herdr: [{ target: "tab", name: "Task" }] } as never, true).valid, false);
});

test("explicit validation permits Pi, one Herdr resource, or both inside Herdr", () => {
	for (const target of HERDR_RENAME_TARGETS) {
		assert.equal(validateRenameRequest({ herdr: { target, name: "Requested" }, mode: "explicit-request" }, true).valid, true);
		assert.equal(validateRenameRequest({ piName: "Requested", herdr: { target, name: "Requested" }, mode: "explicit-request" }, true).valid, true);
	}
	assert.equal(validateRenameRequest({ piName: "Requested", mode: "explicit-request" }, false).valid, true);
	assert.equal(validateRenameRequest({ herdr: { target: "tab", name: "Requested" }, mode: "explicit-request" }, false).valid, true);
	assert.equal(validateRenameRequest({ mode: "explicit-request" }, true).valid, false);
});

test("rename command queues the normal pair, or rejects a single name for both", () => {
	assert.deepEqual(parseRenameCommand(""), { kind: "queue", target: "both" });
	assert.deepEqual(parseRenameCommand("both"), { kind: "queue", target: "both" });
	assert.equal(parseRenameCommand("both New Name").kind, "error");
});

test("rename command supports canonical targets and multiword direct names", () => {
	assert.deepEqual(parseRenameCommand("pi"), { kind: "queue", target: "pi" });
	assert.deepEqual(parseRenameCommand("pi Build the session"), { kind: "direct", target: "pi", name: "Build the session" });
	assert.deepEqual(parseRenameCommand("tab 'Compact Label'"), { kind: "direct", target: "tab", name: "Compact Label" });
	assert.deepEqual(parseRenameCommand("workspace Workspace Name"), { kind: "direct", target: "workspace", name: "Workspace Name" });
	assert.deepEqual(parseRenameCommand("pane \"Pane Name\""), { kind: "direct", target: "pane", name: "Pane Name" });
	assert.equal(parseRenameCommand("unknown Name").kind, "error");
});

test("rename command dispatches queue, direct, and error actions", async () => {
	const events: string[] = [];
	const handlers = {
		onQueue: (target: "both" | "pi" | "tab" | "workspace" | "pane") => { events.push(`queue:${target}`); },
		onDirect: (target: "pi" | "tab" | "workspace" | "pane", name: string) => { events.push(`direct:${target}:${name}`); },
		onError: (message: string) => { events.push(`error:${message}`); },
	};

	await dispatchRenameCommand("both", handlers);
	await dispatchRenameCommand("pi Direct Name", handlers);
	await dispatchRenameCommand("both One Name", handlers);

	assert.equal(events[0], "queue:both");
	assert.equal(events[1], "direct:pi:Direct Name");
	assert.match(events[2] ?? "", /^error:/);
});
