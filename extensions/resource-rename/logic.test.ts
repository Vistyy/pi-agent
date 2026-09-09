import assert from "node:assert/strict";
import test from "node:test";

import {
	SESSION_NAME_ENTRY,
	decideTabRestore,
	findBranchTabName,
	normalizeSessionNames,
	parseRenameCommand,
} from "./logic.ts";

const custom = (customType: string, data: unknown) => ({ type: "custom", customType, data });
const state = (data: unknown) => custom(SESSION_NAME_ENTRY, data);

const legacyTab = (name: string) => state({
	kind: "automatic-name",
	target: "tab",
	name,
});

test("branch-local state chooses the latest compact alias and ignores abandoned branches", () => {
	const activeBranch = [state({ tabName: "Current Alias" }), { type: "message" }];
	const abandonedBranch = [state({ tabName: "Abandoned Alias" })];

	assert.equal(findBranchTabName(activeBranch), "Current Alias");
	assert.equal(findBranchTabName(abandonedBranch), "Abandoned Alias");
	assert.equal(findBranchTabName(activeBranch), "Current Alias");
});

test("legacy successful automatic tab entries remain readable", () => {
	assert.equal(findBranchTabName([legacyTab("Legacy Alias")]), "Legacy Alias");
	assert.equal(findBranchTabName([state({ kind: "automatic-name", target: "pi", name: "ignored" })]), undefined);
	assert.equal(findBranchTabName([state({ kind: "automatic-name", target: "tab", name: "  " })]), undefined);
});

test("tab restoration only claims its default numeric label", () => {
	assert.equal(decideTabRestore("7", 7, "Build API"), "restore");
	assert.equal(decideTabRestore("Build API", 7, "Build API"), "already-restored");
	assert.equal(decideTabRestore("User Label", 7, "Build API"), "preserve");
	assert.equal(decideTabRestore("07", 7, "Build API"), "preserve");
});

test("session names require Pi name and trim optional tab name", () => {
	assert.deepEqual(normalizeSessionNames({ piName: " Build API ", tabName: " Compact Tab " }), {
		piName: "Build API",
		tabName: "Compact Tab",
	});
	assert.deepEqual(normalizeSessionNames({ piName: "Pi only" }), { piName: "Pi only" });
	assert.throws(() => normalizeSessionNames({ piName: "  " }), /piName must not be blank/);
	assert.throws(() => normalizeSessionNames({ piName: "Pi", tabName: "  " }), /tabName must not be blank/);
});

test("rename is only a no-argument naming shortcut", () => {
	assert.deepEqual(parseRenameCommand(""), { queue: true });
	assert.deepEqual(parseRenameCommand("  \t"), { queue: true });
	assert.deepEqual(parseRenameCommand("pi New Name"), { queue: false, error: "Usage: /rename" });
	assert.deepEqual(parseRenameCommand("tab New Name"), { queue: false, error: "Usage: /rename" });
});
