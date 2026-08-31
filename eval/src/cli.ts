#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCatalog } from "./catalog.js";
import { runEvaluation } from "./runner.js";

const evalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function positiveInteger(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  pnpm eval validate",
      "  pnpm eval run --case <id> --system <id> [--trials <count>] [--timeout-ms <milliseconds>] [--output <directory>]",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command) usage();
  const catalog = await loadCatalog(evalRoot);

  if (command === "validate") {
    console.log(`Validated ${catalog.behaviors.size} behavior(s), ${catalog.cases.size} case(s), and ${catalog.systems.size} configured system(s).`);
    return;
  }

  if (command === "run") {
    const caseId = valueAfter(args, "--case");
    const systemId = valueAfter(args, "--system");
    if (!caseId || !systemId) usage();
    const trials = positiveInteger(valueAfter(args, "--trials"), 1, "Trial count");
    const timeoutMs = positiveInteger(valueAfter(args, "--timeout-ms"), 300_000, "Timeout");
    const outputRoot = path.resolve(valueAfter(args, "--output") ?? path.join(evalRoot, "runs"));
    const result = await runEvaluation({ catalog, caseId, systemId, trials, timeoutMs, outputRoot });
    console.log(`Run artifacts: ${result.directory}`);
    return;
  }

  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
