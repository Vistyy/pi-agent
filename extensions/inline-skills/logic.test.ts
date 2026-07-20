import assert from "node:assert/strict";
import test from "node:test";

import {
	applyInlineSlashCompletion,
	enableInlineSlashAutocomplete,
	getInlineSlashPrefix,
	planInlineSkills,
} from "./logic.ts";

test("typing a later slash triggers the editor autocomplete request", () => {
	const editor = {
		text: "Review with ",
		triggers: 0,
		handleInput(data: string) {
			this.text += data;
		},
		getLines() {
			return [this.text];
		},
		getCursor() {
			return { line: 0, col: this.text.length };
		},
		isShowingAutocomplete() {
			return false;
		},
		tryTriggerAutocomplete() {
			this.triggers += 1;
		},
	};

	enableInlineSlashAutocomplete(editor);
	editor.handleInput("/");

	assert.equal(editor.triggers, 1);
});

test("a later slash requests inline skill completion", () => {
	assert.equal(getInlineSlashPrefix(["Review with /skill:code"], 0, 23), "/skill:code");
	assert.equal(getInlineSlashPrefix(["/skill:code"], 0, 11), undefined);
	assert.equal(getInlineSlashPrefix(["Review", "/skill:code"], 1, 11), "/skill:code");
});

test("inline completion replaces only the active slash token", () => {
	assert.deepEqual(
		applyInlineSlashCompletion(["Use /skill:co for this"], 0, 13, "skill:code-review", "/skill:co"),
		{
			lines: ["Use /skill:code-review for this"],
			cursorLine: 0,
			cursorCol: 23,
		},
	);
});

const skills = new Map([
	[
		"alpha",
		{
			name: "alpha",
			location: "/skills/alpha/SKILL.md",
			baseDir: "/skills/alpha",
			body: "Alpha instructions.",
		},
	],
	[
		"beta",
		{
			name: "beta",
			location: "/skills/beta/SKILL.md",
			baseDir: "/skills/beta",
			body: "Beta instructions.",
		},
	],
]);

test("one leading skill stays on Pi's native invocation path", () => {
	assert.equal(planInlineSkills("/skill:alpha review this", (name) => skills.get(name)), undefined);
});

test("inline skills keep references in the prompt and provide separate context blocks", () => {
	assert.deepEqual(
		planInlineSkills("Use /skill:alpha, then /skill:beta. Keep /skill:missing.", (name) => skills.get(name)),
		{
			prompt: "Use /skill:alpha, then /skill:beta. Keep /skill:missing.",
			skills: [skills.get("alpha"), skills.get("beta")],
		},
	);
});

test("multiple skills beginning with a skill bypass native single-skill expansion", () => {
	assert.deepEqual(planInlineSkills("/skill:alpha use /skill:beta", (name) => skills.get(name)), {
		prompt: " /skill:alpha use /skill:beta",
		skills: [skills.get("alpha"), skills.get("beta")],
	});
});
