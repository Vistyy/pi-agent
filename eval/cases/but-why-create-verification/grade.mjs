#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

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
const addedSkillNames = [...new Set(changedPaths.flatMap((path) => {
  const match = path.match(/^\.pi\/skills\/([^/]+)/);
  return match ? [match[1]] : [];
}))];

const skillDirectory = addedSkillNames.length === 1
  ? join(workspace, ".pi", "skills", addedSkillNames[0])
  : undefined;
let skillText = "";
let producedFiles = [];
if (skillDirectory) {
  try { skillText = await readFile(join(skillDirectory, "SKILL.md"), "utf8"); } catch {}
  producedFiles = await walk(skillDirectory).catch(() => []);
}
const featureFiles = producedFiles
  .filter((path) => path.startsWith("features/") && path.endsWith(".md"))
  .sort();
const evidenceFiles = producedFiles
  .filter((path) => path.startsWith("evidence/") && path.endsWith(".md"))
  .sort();

const requiredConcepts = {
  launch: /(?:^## .*launch|command -v by|supported launch)/im.test(skillText),
  doctor: /(?:^## Doctor\b|by --version)/m.test(skillText),
  drive: /(?:^## .*drive|run the mapped feature|by task create)/im.test(skillText),
  evidence: /(?:^## Evidence\b|evidence policy|preserve .*evidence)/im.test(skillText),
  cleanup: /(?:^## Cleanup\b|cleanup observation|trap .*rm|remove the temporary root)/im.test(skillText)
};
const unresolvedPlaceholders = [...skillText.matchAll(/<[^>\n]+>|\b(?:TODO|TBD)\b/gi)]
  .map((match) => match[0])
  .filter((value) => !new Set(["<PREFIX>", "<task-id>", "<text>"]).has(value));
const hasFrontmatter = /^---\n[\s\S]*?^name:\s*[a-z0-9-]+\s*$[\s\S]*?^description:\s*\S/m.test(skillText);
const mentionsDisposableState = /disposable|temporary|temp(?:orary)? (?:repo|repository|directory)|mktemp/i.test(skillText);
const mentionsRealCli = /\bby\b/.test(skillText) && /CLI|command|terminal/i.test(skillText);
const inlineFeatureRows = skillText.split("\n").filter((line) => /^\|\s*[^-|]/.test(line)).length;
const featureMapSeeded = (featureFiles.includes("features/README.md") && featureFiles.length >= 2) || inlineFeatureRows >= 3;

const trajectory = (await readFile(sessionFile, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const toolCalls = trajectory.flatMap((entry) => {
  const message = entry.type === "message" ? entry.message : undefined;
  if (message?.role !== "assistant" || !Array.isArray(message.content)) return [];
  return message.content.filter((part) => part.type === "toolCall").map((part) => ({ name: part.name, arguments: part.arguments }));
});
const bashCommands = toolCalls.filter((call) => call.name === "bash").map((call) => String(call.arguments?.command ?? ""));
const exercisedCli = bashCommands.some((command) => /(^|[;&|()\s])(?:by|\.\/dist\/main\.js|bun\s+run\s+src\/main)/.test(command));
const usedDisposableLocation = bashCommands.some((command) => /mktemp|\/tmp\/|temp(?:orary)?/i.test(command));
const cleanupAttempted = bashCommands.some((command) => /\brm\b|cleanup|worktree remove|trap\b/i.test(command));
const evidenceText = (await Promise.all(evidenceFiles.map((path) => readFile(join(skillDirectory, path), "utf8")))).join("\n");
const successfulEvidence = /exited with status `?0`?|cleanup_remaining=no|final cleanup check reported/i.test(evidenceText);

const gates = {
  exactlyOneAddedSkill: addedSkillNames.length === 1,
  validFrontmatter: hasFrontmatter,
  requiredConceptsPresent: Object.values(requiredConcepts).every(Boolean),
  featureMapSeeded,
  noUnresolvedPlaceholders: unresolvedPlaceholders.length === 0,
  groundedInButWhyCli: mentionsRealCli,
  disposableStateDocumented: mentionsDisposableState,
  endToEndEvidenceRecorded: evidenceFiles.length > 0 && successfulEvidence,
  productCodeUnchanged: outsideAllowed.length === 0
};

process.stdout.write(`${JSON.stringify({
  version: 2,
  gates,
  deterministicPass: Object.values(gates).every(Boolean),
  observations: {
    changedPaths,
    outsideAllowed,
    addedSkillNames,
    producedFiles,
    featureFiles,
    evidenceFiles,
    requiredConcepts,
    unresolvedPlaceholders,
    toolCallCount: toolCalls.length,
    bashCommandCount: bashCommands.length,
    exercisedCli,
    usedDisposableLocation,
    cleanupAttempted
  },
  semanticReviewRequired: [
    "Whether the documented commands are correct for But Why's supported runtime.",
    "Whether the feature map describes real user-visible behavior accurately and maintainably.",
    "Whether the observed execution and cleanup constitute trustworthy end-to-end evidence."
  ]
}, null, 2)}\n`);

async function walk(root, prefix = "") {
  const results = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) results.push(...await walk(root, path));
    else if (entry.isFile()) results.push(path);
  }
  return results;
}
