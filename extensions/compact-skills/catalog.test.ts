import assert from "node:assert/strict";
import test from "node:test";
import type { Skill } from "@earendil-works/pi-coding-agent";
import { formatCompactSkills } from "./catalog.ts";

type CatalogSkill = Pick<Skill, "name" | "description" | "filePath" | "disableModelInvocation">;

const example: CatalogSkill = {
	name: "example",
	description: '  Use for "quoted" text: preserve <tags>, A & B, and spacing.  ',
	filePath: "/skills/example/SKILL.md",
	disableModelInvocation: false,
};

const readGuidance = [
	"The following skills provide specialized instructions for specific tasks.",
	"Use the read tool to load a skill's file when the task matches its description.",
	"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
	"",
	"File for each skill: <root>/<name>/SKILL.md.",
].join("\n");

test("renders complete descriptions without trimming or escaping their text", () => {
	assert.equal(
		formatCompactSkills([example], "read"),
		readGuidance + '\n\nRoot: /skills\nexample:   Use for "quoted" text: preserve <tags>, A & B, and spacing.  ',
	);
});

test("preserves discovery order even when roots interleave", () => {
	const second: CatalogSkill = {
		name: "second",
		description: "Second description.",
		filePath: "/other/second/SKILL.md",
		disableModelInvocation: false,
	};
	const third: CatalogSkill = {
		name: "third",
		description: "Third description.",
		filePath: "/skills/third/SKILL.md",
		disableModelInvocation: false,
	};
	assert.equal(
		formatCompactSkills([example, second, third], "read"),
		readGuidance + '\n\nRoot: /skills\nexample:   Use for "quoted" text: preserve <tags>, A & B, and spacing.  \n\nRoot: /other\nsecond: Second description.\n\nRoot: /skills\nthird: Third description.',
	);
});

test("does not advertise explicit-command-only skills or let their paths prevent compaction", () => {
	const hidden: CatalogSkill = {
		name: "hidden",
		description: "Hidden skill.",
		filePath: "/nonstandard.md",
		disableModelInvocation: true,
	};
	assert.equal(formatCompactSkills([hidden], "read"), undefined);
	assert.equal(
		formatCompactSkills([example, hidden], "read"),
		readGuidance + '\n\nRoot: /skills\nexample:   Use for "quoted" text: preserve <tags>, A & B, and spacing.  ',
	);
	assert.equal(formatCompactSkills([], "read"), undefined);
});

test("declines compaction rather than deriving an incorrect path or altering multiline prose", () => {
	for (const change of [
		{ filePath: "/skills/different/SKILL.md" },
		{ filePath: "/skills/example.md" },
		{ description: "First line.\nSecond line." },
		{ description: "First line.\rSecond line." },
		{ filePath: "/skills\nroot/example/SKILL.md" },
		{ name: "example:ambiguous", filePath: "/skills/example:ambiguous/SKILL.md" },
	]) {
		assert.equal(formatCompactSkills([example, { ...example, ...change }], "read"), undefined);
	}
});

test("uses bash activation guidance when read is not active", () => {
	const result = formatCompactSkills([example], "bash");
	assert.ok(result?.includes("Use bash to load a skill's file when the task matches its description."));
	assert.ok(!result?.includes("Use the read tool"));
});
