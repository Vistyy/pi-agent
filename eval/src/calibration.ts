import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { Ajv, type ErrorObject } from "ajv";

import { calibrationSchema } from "./schemas.js";
import type { CalibrationSet, Catalog, LoadedCalibrationSet } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: true });
const validateCalibration = ajv.compile<CalibrationSet>(calibrationSchema);

function formatErrors(file: string, errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => `${file}${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("\n");
}

function assertUniqueIds(file: string, values: Array<{ id: string }>): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) throw new Error(`${file}: duplicate calibration sample id "${value.id}"`);
    seen.add(value.id);
  }
}

async function calibrationFiles(directory: string): Promise<string[]> {
  const behaviorDirectories = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    behaviorDirectories
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const child = path.join(directory, entry.name);
        return (await readdir(child, { withFileTypes: true }))
          .filter((candidate) => candidate.isFile() && candidate.name.endsWith(".json"))
          .map((candidate) => path.join(child, candidate.name));
      }),
  );
  return files.flat().sort();
}

function validateReferences(file: string, set: CalibrationSet, catalog: Catalog): void {
  const behavior = catalog.behaviors.get(set.behavior_id);
  if (!behavior) throw new Error(`${file}: unknown behavior "${set.behavior_id}"`);

  const catalogCase = catalog.cases.get(set.case_id);
  if (!catalogCase) throw new Error(`${file}: unknown case "${set.case_id}"`);
  if (!catalogCase.spec.behaviors.some((entry) => entry.id === set.behavior_id)) {
    throw new Error(`${file}: case "${set.case_id}" does not exercise behavior "${set.behavior_id}"`);
  }

  const criterion = catalogCase.spec.criteria.find((entry) => entry.id === set.criterion.id);
  if (!criterion) throw new Error(`${file}: case "${set.case_id}" has no criterion "${set.criterion.id}"`);
  if (criterion.behavior !== set.behavior_id) {
    throw new Error(`${file}: criterion "${set.criterion.id}" does not evaluate behavior "${set.behavior_id}"`);
  }
  if (criterion.success.trim() !== set.criterion.pass.trim() || criterion.failure.trim() !== set.criterion.fail.trim()) {
    throw new Error(`${file}: calibration pass and fail rules must match criterion "${set.criterion.id}"`);
  }

  assertUniqueIds(file, [...set.semantic_samples, ...set.validity_samples]);
  const diagnostics = new Set(set.diagnostics);
  const trajectoryFixtures = new Set(Object.keys(set.trajectory_fixtures));
  for (const sample of set.semantic_samples) {
    if (!trajectoryFixtures.has(sample.trajectory_fixture)) {
      throw new Error(`${file}: sample "${sample.id}" references unknown trajectory fixture "${sample.trajectory_fixture}"`);
    }
    if (!diagnostics.has(sample.expected.diagnostic)) {
      throw new Error(`${file}: sample "${sample.id}" references unknown diagnostic "${sample.expected.diagnostic}"`);
    }
  }

  const observations = new Map(catalogCase.spec.observations.map((entry) => [entry.id, entry.boundary]));
  for (const sample of set.validity_samples) {
    const seen = new Set<string>();
    for (const evidence of sample.evidence) {
      if (seen.has(evidence.id)) throw new Error(`${file}: sample "${sample.id}" repeats evidence "${evidence.id}"`);
      seen.add(evidence.id);
      const boundary = observations.get(evidence.id);
      if (!boundary) throw new Error(`${file}: sample "${sample.id}" references unknown observation "${evidence.id}"`);
      if (boundary !== evidence.boundary) {
        throw new Error(`${file}: sample "${sample.id}" gives observation "${evidence.id}" boundary "${evidence.boundary}", expected "${boundary}"`);
      }
    }
  }
}

export async function loadCalibrationSets(root: string, catalog: Catalog): Promise<LoadedCalibrationSet[]> {
  const directory = path.join(path.resolve(root), "calibration");
  const sets: LoadedCalibrationSet[] = [];
  const identities = new Set<string>();

  for (const file of await calibrationFiles(directory)) {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      throw new Error(`Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!validateCalibration(value)) throw new Error(formatErrors(file, validateCalibration.errors));
    validateReferences(file, value, catalog);

    const identity = `${value.behavior_id}/${value.case_id}/${value.criterion.id}`;
    if (identities.has(identity)) throw new Error(`${file}: duplicate calibration set "${identity}"`);
    identities.add(identity);
    sets.push({ set: value, file });
  }

  if (sets.length === 0) throw new Error(`${directory}: no calibration sets found`);
  return sets;
}
