#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

const [workspace, sessionFile] = process.argv.slice(2);
if (!workspace || !sessionFile) {
  console.error("usage: node grade.mjs <workspace> <session-file>");
  process.exit(64);
}

const status = execFileSync("git", ["status", "--porcelain=v1"], { cwd: workspace, encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
const changedPaths = status.map((line) => line.slice(3));
const outsideAllowed = changedPaths.filter((path) => !path.startsWith(".pi/skills/"));

const skillsRoot = join(workspace, ".pi", "skills");
let skillDirectories = [];
try {
  skillDirectories = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("verify-"))
    .map((entry) => join(skillsRoot, entry.name));
} catch {}

const skillDirectory = skillDirectories.length === 1 ? skillDirectories[0] : undefined;
let skillText = "";
let featureFiles = [];
if (skillDirectory) {
  try {
    skillText = await readFile(join(skillDirectory, "SKILL.md"), "utf8");
  } catch {}
  try {
    featureFiles = (await readdir(join(skillDirectory, "features"), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort();
  } catch {}
}

const requiredSections = ["Launch", "Doctor", "Drive", "Evidence", "Cleanup"];
const missingSections = requiredSections.filter((section) => !new RegExp(`^## ${section}\\b`, "m").test(skillText));
const unresolvedPlaceholders = [...skillText.matchAll(/<[^>\n]+>|\b(?:TODO|TBD)\b/gi)].map((match) => match[0]);
const hasFrontmatter = /^---\n[\s\S]*?^name:\s*verify-[a-z0-9-]+\s*$[\s\S]*?^description:\s*\S/m.test(skillText);
const mentionsDisposableState = /disposable|temporary|temp(?:orary)? (?:repo|repository|directory)|mktemp/i.test(skillText);
const mentionsRealCli = /\bby\b/.test(skillText) && /CLI|command|terminal/i.test(skillText);

const trajectory = (await readFile(sessionFile, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const toolCalls = trajectory.flatMap((entry) => {
  const message = entry.type === "message" ? entry.message : undefined;
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return [];
  return message.content.filter((part) => part.type === "toolCall").map((part) => ({ name: part.name, arguments: part.arguments }));
});
const bashCommands = toolCalls
  .filter((call) => call.name === "bash")
  .map((call) => String(call.arguments?.command ?? ""));
const exercisedCli = bashCommands.some((command) => /(^|[;&|()\s])(?:by|\.\/dist\/main\.js|bun\s+run\s+src\/main)/.test(command));
const usedDisposableLocation = bashCommands.some((command) => /mktemp|\/tmp\/|temp(?:orary)?/i.test(command));
const cleanupAttempted = bashCommands.some((command) => /\brm\b|cleanup|worktree remove|trap\b/i.test(command));

const gates = {
  exactlyOneVerificationSkill: skillDirectories.length === 1,
  validFrontmatter: hasFrontmatter,
  requiredSectionsPresent: missingSections.length === 0,
  featureMapSeeded: featureFiles.includes("README.md") && featureFiles.length >= 2,
  noUnresolvedPlaceholders: unresolvedPlaceholders.length === 0,
  groundedInButWhyCli: mentionsRealCli,
  disposableStateDocumented: mentionsDisposableState,
  productCodeUnchanged: outsideAllowed.length === 0
};

const result = {
  version: 1,
  gates,
  deterministicPass: Object.values(gates).every(Boolean),
  observations: {
    changedPaths,
    outsideAllowed,
    verificationSkillDirectories: skillDirectories.map((path) => relative(workspace, path)),
    featureFiles,
    missingSections,
    unresolvedPlaceholders,
    toolCallCount: toolCalls.length,
    bashCommandCount: bashCommands.length,
    exercisedCli,
    usedDisposableLocation,
    cleanupAttempted
  },
  semanticReviewRequired: [
    "Whether the documented commands are correct for But Why's supported runtime.",
    "Whether the feature map describes real user-visible behavior accurately.",
    "Whether the observed execution and cleanup constitute trustworthy end-to-end evidence."
  ]
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
