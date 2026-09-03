#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const evalRoot = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await readFile(join(evalRoot, "catalog.json"), "utf8"));
const errors = [];

if (catalog.version !== 1) errors.push("catalog version must be 1");
for (const [id, model] of Object.entries(catalog.models ?? {})) {
  if (!model.selector?.includes("/")) errors.push(`model ${id} must use a provider/model selector`);
  if (!model.thinking) errors.push(`model ${id} must declare thinking`);
}
for (const [id, candidate] of Object.entries(catalog.candidates ?? {})) {
  if (!new Set(["control", "skill"]).has(candidate.kind)) errors.push(`candidate ${id} has an unknown kind`);
  if (candidate.kind === "skill") {
    const path = resolve(evalRoot, candidate.path);
    try { await access(path); } catch { errors.push(`candidate ${id} is missing ${path}`); }
    if (!candidate.invocation) errors.push(`candidate ${id} has no invocation`);
    if (candidate.source?.skillSha256) {
      const digest = createHash("sha256").update(await readFile(path)).digest("hex");
      if (digest !== candidate.source.skillSha256) errors.push(`candidate ${id} no longer matches its recorded digest`);
    }
  }
}

const caseRoot = join(evalRoot, "cases");
for (const entry of await readdir(caseRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = join(caseRoot, entry.name);
  let definition;
  try { definition = JSON.parse(await readFile(join(directory, "case.json"), "utf8")); }
  catch { errors.push(`case ${entry.name} has no valid case.json`); continue; }
  if (definition.id !== entry.name) errors.push(`case ${entry.name} has mismatched id ${definition.id}`);
  if (!definition.question || !definition.prompt) errors.push(`case ${entry.name} is missing its question or prompt`);
  if (!Array.isArray(definition.criteria) || definition.criteria.length < 1) errors.push(`case ${entry.name} has no criteria`);
  if (!definition.candidates?.includes("control")) errors.push(`case ${entry.name} has no control`);
  for (const id of definition.models ?? []) if (!catalog.models[id]) errors.push(`case ${entry.name} uses unknown model ${id}`);
  for (const id of definition.candidates ?? []) if (!catalog.candidates[id]) errors.push(`case ${entry.name} uses unknown candidate ${id}`);
  try { await access(join(directory, definition.grader)); } catch { errors.push(`case ${entry.name} is missing grader ${definition.grader}`); }
  try { execFileSync("git", ["-C", definition.source.repository, "cat-file", "-e", `${definition.source.revision}^{commit}`]); }
  catch { errors.push(`case ${entry.name} source revision is unavailable`); }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
process.stdout.write("Evaluation catalog is valid.\n");
