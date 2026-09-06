import assert from "node:assert/strict";
import test from "node:test";

import {
	decideAutomaticRename,
	restoreSessionTabState,
	type SessionTabState,
} from "./logic.ts";

const baseline = {
	type: "custom",
	customType: "herdr-rename",
	data: {
		kind: "baseline",
		sessionId: "session-a",
		tabId: "tab-1",
		workspaceId: "workspace-1",
		label: "My Custom Tab",
	},
};

function stateWithBaseline(): SessionTabState {
	return restoreSessionTabState([baseline], "session-a", "tab-1", "workspace-1");
}

test("a descriptive label present at session start is eligible for automatic rename", () => {
	assert.equal(decideAutomaticRename(stateWithBaseline(), "My Custom Tab", "Build API"), "rename");
});

test("a label changed after session start is not automatically overwritten", () => {
	assert.equal(decideAutomaticRename(stateWithBaseline(), "User Current Name", "Build API"), "label-changed");
});

test("a same-session rename marker survives reload and suppresses automatic naming", () => {
	const state = restoreSessionTabState(
		[
			baseline,
			{
				type: "custom",
				customType: "herdr-rename",
				data: { kind: "renamed", sessionId: "session-a", tabId: "tab-1" },
			},
		],
		"session-a",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.renamed, true);
	assert.equal(decideAutomaticRename(state, "Build API", "Fix API"), "already-renamed");
});

test("a marker from another Pi session does not suppress the current session", () => {
	const state = restoreSessionTabState(
		[
			{
				type: "custom",
				customType: "herdr-rename",
				data: { kind: "renamed", sessionId: "old-session", tabId: "tab-1" },
			},
		],
		"session-b",
		"tab-1",
		"workspace-1",
	);

	assert.equal(state.renamed, false);
	assert.equal(state.baseline, undefined);
});

test("a baseline from another Pi session does not make a stale title ineligible", () => {
	const state = restoreSessionTabState([baseline], "session-b", "tab-1", "workspace-1");

	assert.equal(decideAutomaticRename(state, "My Custom Tab", "New Task"), "baseline-unavailable");
});
