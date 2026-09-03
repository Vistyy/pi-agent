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
  .filter((path) => path.startsWith("evidence/"))
  .sort();
const producedText = (await Promise.all(producedFiles.map((path) => readFile(join(skillDirectory, path), "utf8").catch(() => "")))).join("\n");

const requiredConcepts = {
  launch: /launch|install|executable resolution|setup/i.test(producedText),
  readiness: /doctor|by --version|by --help|readiness|preflight|package checksum/i.test(producedText),
  drive: /drive|run the mapped feature|by task create/i.test(producedText),
  evidence: /evidence policy|preserve .*evidence|evidence contract|stdout|exit status/i.test(producedText),
  cleanup: /cleanup|trap .*rm|remove the temporary root|disposableRootRemoved/i.test(producedText)
};
const unresolvedPlaceholders = [...skillText.matchAll(/\b(?:TODO|TBD)\b/gi)].map((match) => match[0]);
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
const toolResultText = trajectory.flatMap((entry) => {
  const message = entry.type === "message" ? entry.message : undefined;
  if (message?.role !== "toolResult" || !Array.isArray(message.content)) return [];
  return message.content.filter((part) => part.type === "text").map((part) => part.text);
}).join("\n");
const bashCommands = toolCalls.filter((call) => call.name === "bash").map((call) => String(call.arguments?.command ?? ""));
const exercisedCli = bashCommands.some((command) => /(^|[;&|()\s])(?:by|\.\/dist\/main\.js|bun\s+run\s+src\/main)/.test(command));
const usedDisposableLocation = bashCommands.some((command) => /mktemp|\/tmp\/|temp(?:orary)?/i.test(command));
const cleanupAttempted = bashCommands.some((command) => /\brm\b|cleanup|worktree remove|trap\b/i.test(command));
const evidenceText = (await Promise.all(evidenceFiles.map((path) => readFile(join(skillDirectory, path), "utf8")))).join("\n");
const successfulEvidence = /exited with status `?0`?|\[exit 0\]|"exitCode"\s*:\s*0|"result"\s*:\s*"passed"/i.test(evidenceText);
const cleanupVerified = /disposableRootRemoved=true|cleanup_remaining=no|final cleanup check reported|working-tree cleanup:\s*ok|scratch_removed=\/tmp\//i.test(`${evidenceText}\n${toolResultText}`);
const successfulExternalEvidence = exercisedCli
  && usedDisposableLocation
  && /doctor=healthy|"exitCode"\s*:\s*0|exit_code:\s*0/i.test(toolResultText)
  && /evidence(?:_preserved)?=\/tmp\//i.test(toolResultText);

const gates = {
  exactlyOneAddedSkill: addedSkillNames.length === 1,
  validFrontmatter: hasFrontmatter,
  requiredConceptsPresent: Object.values(requiredConcepts).every(Boolean),
  featureMapSeeded,
  noUnresolvedPlaceholders: unresolvedPlaceholders.length === 0,
  groundedInButWhyCli: mentionsRealCli,
  disposableStateDocumented: mentionsDisposableState,
  endToEndEvidenceRecorded: ((evidenceFiles.length > 0 && successfulEvidence) || successfulExternalEvidence) && cleanupVerified,
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
    cleanupAttempted,
    successfulExternalEvidence,
    cleanupVerified
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
