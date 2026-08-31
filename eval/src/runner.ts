import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Catalog } from "./types.js";
import { runTrial } from "./trial.js";

interface RunOptions {
  catalog: Catalog;
  caseId: string;
  systemId: string;
  trials: number;
  timeoutMs: number;
  outputRoot: string;
}

function runId(caseId: string, systemId: string): string {
  return `${new Date().toISOString().replace(/[:.]/gu, "-")}_${caseId}_${systemId}`;
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export async function runEvaluation(options: RunOptions): Promise<{ runId: string; directory: string }> {
  const catalogCase = options.catalog.cases.get(options.caseId);
  if (!catalogCase) throw new Error(`Unknown case: ${options.caseId}`);
  const system = options.catalog.systems.get(options.systemId);
  if (!system) throw new Error(`Unknown configured system: ${options.systemId}`);
  if (!Number.isInteger(options.trials) || options.trials < 1) throw new Error("Trial count must be a positive integer");

  const id = runId(options.caseId, options.systemId);
  const createdAt = new Date().toISOString();
  const directory = path.join(options.outputRoot, id);
  const trialDirectory = path.join(directory, "trials");
  await mkdir(trialDirectory, { recursive: true });
  await writeJsonAtomic(path.join(directory, "run.json"), {
    schema_version: 1,
    id,
    created_at: createdAt,
    case_id: options.caseId,
    system_id: options.systemId,
    requested_trials: options.trials,
    timeout_ms: options.timeoutMs,
    status: "running",
  });

  let completed = 0;
  try {
    for (let trialIndex = 1; trialIndex <= options.trials; trialIndex += 1) {
      const artifact = await runTrial({
        catalog: options.catalog,
        catalogCase,
        system,
        runId: id,
        trialIndex,
        timeoutMs: options.timeoutMs,
      });
      const file = path.join(trialDirectory, `${String(trialIndex).padStart(3, "0")}.json`);
      await writeJsonAtomic(file, artifact);
      completed = trialIndex;
      console.log(`${artifact.validity.toUpperCase()} ${options.caseId} ${options.systemId} trial ${trialIndex}`);
    }
  } finally {
    await writeJsonAtomic(path.join(directory, "run.json"), {
      schema_version: 1,
      id,
      created_at: createdAt,
      case_id: options.caseId,
      system_id: options.systemId,
      requested_trials: options.trials,
      completed_trials: completed,
      timeout_ms: options.timeoutMs,
      status: completed === options.trials ? "complete" : "interrupted",
    });
  }

  return { runId: id, directory };
}
