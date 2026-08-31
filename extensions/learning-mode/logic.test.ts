import assert from "node:assert/strict";
import test from "node:test";

import {
	appendLearningReminder,
	appendMentoringContract,
	LEARNING_MODE_CONTRACT_MARKER,
	LEARNING_MODE_REMINDER,
	LEARNING_MODE_REMINDER_TYPE,
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

test("learning reminder is appended without mutating stored messages", () => {
	const messages = [{ role: "user", content: "Help me understand this system." }];
	const result = appendLearningReminder(messages, 123);

	assert.equal(messages.length, 1);
	assert.deepEqual(result, [
		messages[0],
		{
			role: "custom",
			customType: LEARNING_MODE_REMINDER_TYPE,
			content: LEARNING_MODE_REMINDER,
			display: false,
			timestamp: 123,
		},
	]);
});

test("learning reminder is not duplicated in a chained context", () => {
	const once = appendLearningReminder([], 123);
	const twice = appendLearningReminder(once, 456);

	assert.deepEqual(twice, once);
});
