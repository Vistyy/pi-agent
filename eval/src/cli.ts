#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCalibration } from "./calibrate.js";
import { loadCalibrationSets } from "./calibration.js";
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

const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

function thinkingLevel(value: string | undefined): (typeof thinkingLevels)[number] {
  if (!value || !thinkingLevels.includes(value as (typeof thinkingLevels)[number])) {
    throw new Error(`Judge thinking level must be one of: ${thinkingLevels.join(", ")}`);
  }
  return value as (typeof thinkingLevels)[number];
}

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  pnpm eval validate",
      "  pnpm eval calibrate --judge-provider <id> --judge-model <id> --judge-thinking <level> [--output <directory>]",
      "  pnpm eval run --case <id> --system <id> [--trials <count>] [--timeout-ms <milliseconds>] [--output <directory>]",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command) usage();
  const catalog = await loadCatalog(evalRoot);

  if (command === "validate") {
    const calibrationSets = await loadCalibrationSets(evalRoot, catalog);
    console.log(
      `Validated ${catalog.behaviors.size} behavior(s), ${catalog.cases.size} case(s), ${catalog.systems.size} configured system(s), and ${calibrationSets.length} calibration set(s).`,
    );
    return;
  }

  if (command === "calibrate") {
    const provider = valueAfter(args, "--judge-provider");
    const model = valueAfter(args, "--judge-model");
    if (!provider || !model) usage();
    const calibrationSets = await loadCalibrationSets(evalRoot, catalog);
    const outputRoot = path.resolve(valueAfter(args, "--output") ?? path.join(evalRoot, "runs"));
    const result = await runCalibration({
      catalog,
      calibrations: calibrationSets,
      repositoryRoot: path.dirname(evalRoot),
      outputRoot,
      promptFile: path.join(evalRoot, "graders", "evidence-grounded-semantic", "v3.md"),
      promptRevision: "3",
      judgeModel: {
        provider,
        id: model,
        thinking_level: thinkingLevel(valueAfter(args, "--judge-thinking")),
      },
    });
    console.log(`Calibration artifact: ${result.directory}`);
    console.log(`Acceptance threshold: ${result.accepted ? "met" : "not met"}`);
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
