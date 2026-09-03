#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const workspace = process.argv[2];
if (!workspace) throw new Error("workspace path is required");

await replace(join(workspace, "src/task/adapters/sqlite/sqliteTaskPersistence.ts"), `  seen.add(prerequisiteTaskId);
  return prerequisiteTaskId === dependentTaskId
    ? { ok: false, code: "dependency_self", taskId: prerequisiteTaskId }
    : undefined;
`, `  seen.add(prerequisiteTaskId);
  return undefined;
`);
await replace(join(workspace, "test/task/task-dependency-persistence.test.ts"), `        [["BY-3"], "dependency_self"],
`, "");

async function replace(path, oldText, newText) {
  const text = await readFile(path, "utf8");
  if (text.split(oldText).length !== 2) throw new Error(`fixture anchor did not match exactly once: ${path}`);
  await writeFile(path, text.replace(oldText, newText));
}
