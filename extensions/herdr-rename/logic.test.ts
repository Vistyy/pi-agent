import assert from "node:assert/strict";
import test from "node:test";

import {
	decideAutomaticRename,
	restoreSessionTabState,
	type SessionTabState,
} from "./logic.ts";

const custom = (data: unknown) => ({
	type: "custom",
	customType: "herdr-rename",
	data,
});

const baseline = (runId: string, label = "My Custom Tab") => custom({
	kind: "baseline",
	sessionId: "session-a",
	runId,
	tabId: "tab-1",
	workspaceId: "workspace-1",
	label,
});

const marker = (runId: string) => custom({
	kind: "renamed",
	sessionId: "session-a",
	runId,
	tabId: "tab-1",
});

function stateWithBaseline(): SessionTabState {
	return restoreSessionTabState([baseline("run-1")], "session-a", "tab-1", "workspace-1");
}

test("a descriptive label present at the occupancy baseline is eligible for automatic rename", () => {
	assert.equal(decideAutomaticRename(stateWithBaseline(), "My Custom Tab", "Build API"), "rename");
});

test("a label changed after the occupancy baseline is not automatically overwritten", () => {
	assert.equal(decideAutomaticRename(stateWithBaseline(), "User Current Name", "Build API"), "label-changed");
});

test("a new occupancy for the same session restores the newest baseline and is eligible again", () => {
	const state = restoreSessionTabState(
		[baseline("run-1"), marker("run-1"), baseline("run-2", "Build API")],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.baseline?.runId, "run-2");
	assert.equal(state.renamed, false);
	assert.equal(decideAutomaticRename(state, "Build API", "Fix API"), "rename");
});

test("a same-occupancy reload restores its marker and suppresses automatic naming", () => {
	const state = restoreSessionTabState(
		[baseline("run-1"), marker("run-1")],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.baseline?.runId, "run-1");
	assert.equal(state.renamed, true);
	assert.equal(decideAutomaticRename(state, "Build API", "Fix API"), "already-renamed");
});

test("a marker from an older occupancy does not suppress the newer baseline", () => {
	const state = restoreSessionTabState(
		[baseline("run-1"), baseline("run-2", "Build API"), marker("run-1")],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.baseline?.runId, "run-2");
	assert.equal(state.renamed, false);
});

test("a marker from another Pi session does not suppress the current session", () => {
	const state = restoreSessionTabState(
		[custom({ kind: "renamed", sessionId: "old-session", runId: "run-1", tabId: "tab-1" })],
		"session-b",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.renamed, false);
	assert.equal(state.baseline, undefined);
});

test("legacy entries without a run ID are ignored safely", () => {
	const state = restoreSessionTabState(
		[
			custom({
				kind: "baseline",
				sessionId: "session-a",
				tabId: "tab-1",
				workspaceId: "workspace-1",
				label: "My Custom Tab",
			}),
			custom({ kind: "renamed", sessionId: "session-a", tabId: "tab-1" }),
		],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.baseline, undefined);
	assert.equal(state.renamed, false);
	assert.equal(decideAutomaticRename(state, "My Custom Tab", "New Task"), "baseline-unavailable");
});

test("a baseline from another Pi session does not make a stale title ineligible", () => {
	const state = restoreSessionTabState([baseline("run-1")], "session-b", "tab-1", "workspace-1");

	assert.equal(decideAutomaticRename(state, "My Custom Tab", "New Task"), "baseline-unavailable");
});
