import assert from "node:assert/strict";
import test from "node:test";

import {
	appendMentoringContract,
	LEARNING_MODE_CONTRACT_MARKER,
	LEARNING_MODE_STATE_TYPE,
	parseLearningCommand,
	restoreLearningMode,
} from "./logic.ts";

test("learning command shows status when no argument is provided", () => {
	assert.deepEqual(parseLearningCommand(""), { action: "status" });
	assert.deepEqual(parseLearningCommand("   "), { action: "status" });
});

test("learning command accepts case-insensitive on and off arguments", () => {
	assert.deepEqual(parseLearningCommand(" ON "), { action: "set", enabled: true });
	assert.deepEqual(parseLearningCommand("off"), { action: "set", enabled: false });
	assert.deepEqual(parseLearningCommand("maybe"), { action: "invalid" });
});

test("learning mode defaults to on", () => {
	assert.equal(restoreLearningMode([]), true);
});

test("latest valid state on the active branch wins", () => {
	const entries = [
		{ type: "custom", customType: LEARNING_MODE_STATE_TYPE, data: { enabled: false } },
		{ type: "custom", customType: "other-extension", data: { enabled: true } },
		{ type: "custom", customType: LEARNING_MODE_STATE_TYPE, data: { enabled: "yes" } },
		{ type: "custom", customType: LEARNING_MODE_STATE_TYPE, data: { enabled: true } },
	];
	assert.equal(restoreLearningMode(entries), true);
});

test("mentoring contract is appended exactly once", () => {
	const once = appendMentoringContract("Base prompt", "# Contract\n\nTeach through real work.");
	const twice = appendMentoringContract(once, "# Contract\n\nTeach through real work.");

	assert.equal(once, twice);
	assert.equal(once.split(LEARNING_MODE_CONTRACT_MARKER).length - 1, 1);
	assert.match(once, /Base prompt\n\n<!-- learning-mode-contract -->\n# Contract/);
});

test("an empty contract leaves the prompt unchanged", () => {
	assert.equal(appendMentoringContract("Base prompt", "  \n"), "Base prompt");
});
