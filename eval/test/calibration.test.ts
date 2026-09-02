import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadCalibrationSets } from "../src/calibration.js";
import { loadCatalog } from "../src/catalog.js";

const evalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const calibrationRelativePath = path.join(
  "calibration",
  "reconstruct-relevant-context",
  "evidence-grounded-lifecycle-recommendation.json",
);

async function temporaryEvaluationRoot(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-eval-calibration-"));
  await Promise.all(
    ["behaviors", "cases", "systems", "calibration"].map((directory) =>
      cp(path.join(evalRoot, directory), path.join(root, directory), { recursive: true }),
    ),
  );
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function calibrationAt(root: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(path.join(root, calibrationRelativePath), "utf8")) as Record<string, any>;
}

async function writeCalibration(root: string, value: unknown): Promise<void> {
  await writeFile(path.join(root, calibrationRelativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("loads the accepted semantic and validity calibration samples", async () => {
  const catalog = await loadCatalog(evalRoot);
  const calibrations = await loadCalibrationSets(evalRoot, catalog);

  assert.equal(calibrations.length, 1);
  assert.equal(calibrations[0]?.set.criterion.id, "evidence-grounded-lifecycle-recommendation");
  assert.deepEqual(
    calibrations[0]?.set.semantic_samples.map((sample) => [sample.id, sample.expected.behavior]),
    [
      ["complete-correct-real", "pass"],
      ["concise-complete-correct", "pass"],
      ["session-lifecycle-complete-correct", "pass"],
      ["no-investigation-follows-preference", "fail"],
      ["partial-runtime-wrong-advice", "fail"],
      ["partial-coordinator-lucky-answer", "fail"],
      ["complete-evidence-incorrect-interpretation", "fail"],
    ],
  );
  assert.deepEqual(
    calibrations[0]?.set.validity_samples.map((sample) => [sample.id, sample.expected_validity]),
    [["missing-required-trajectory", "invalid"]],
  );
});

test("rejects undeclared calibration fields", async () => {
  const fixture = await temporaryEvaluationRoot();
  try {
    const value = await calibrationAt(fixture.root);
    value.unreviewed = true;
    await writeCalibration(fixture.root, value);
    const catalog = await loadCatalog(fixture.root);
    await assert.rejects(loadCalibrationSets(fixture.root, catalog), /additional properties/u);
  } finally {
    await fixture.cleanup();
  }
});

test("rejects calibration rules that drift from the case criterion", async () => {
  const fixture = await temporaryEvaluationRoot();
  try {
    const value = await calibrationAt(fixture.root);
    value.criterion.pass = "A different pass rule.";
    await writeCalibration(fixture.root, value);
    const catalog = await loadCatalog(fixture.root);
    await assert.rejects(loadCalibrationSets(fixture.root, catalog), /pass and fail rules must match/u);
  } finally {
    await fixture.cleanup();
  }
});

test("rejects references to unknown trajectory fixtures", async () => {
  const fixture = await temporaryEvaluationRoot();
  try {
    const value = await calibrationAt(fixture.root);
    value.semantic_samples[0].trajectory_fixture = "missing";
    await writeCalibration(fixture.root, value);
    const catalog = await loadCatalog(fixture.root);
    await assert.rejects(loadCalibrationSets(fixture.root, catalog), /unknown trajectory fixture "missing"/u);
  } finally {
    await fixture.cleanup();
  }
});
