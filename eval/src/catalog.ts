import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { parse } from "yaml";

import { behaviorSchema, caseSchema, runtimeSchema, systemSchema } from "./schemas.js";
import type { BehaviorSpec, CaseSpec, Catalog, CatalogCase, ConfiguredSystem, RuntimeBinding } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: true });
const validateBehavior = ajv.compile<BehaviorSpec>(behaviorSchema);
const validateCase = ajv.compile<CaseSpec>(caseSchema);
const validateRuntime = ajv.compile<RuntimeBinding>(runtimeSchema);
const validateSystem = ajv.compile<ConfiguredSystem>(systemSchema);

function formatErrors(file: string, errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => `${file}${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("\n");
}

async function readYaml<T>(file: string, validate: ValidateFunction<T>): Promise<T> {
  let value: unknown;
  try {
    value = parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!validate(value)) throw new Error(formatErrors(file, validate.errors));
  return value;
}

async function yamlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

function assertUniqueIds(file: string, label: string, values: Array<{ id: string }>): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) throw new Error(`${file}: duplicate ${label} id "${value.id}"`);
    seen.add(value.id);
  }
}

function sameKeys(actual: Record<string, unknown>, expected: string[], label: string, file: string): void {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = [...expected].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${file}: ${label} keys must be exactly [${expectedKeys.join(", ")}], got [${actualKeys.join(", ")}]`);
  }
}

async function validateCaseSemantics(
  file: string,
  caseSpec: CaseSpec,
  runtime: RuntimeBinding,
  behaviors: Map<string, BehaviorSpec>,
): Promise<void> {
  if (runtime.case !== caseSpec.id) throw new Error(`${file}: runtime case "${runtime.case}" does not match "${caseSpec.id}"`);

  assertUniqueIds(file, "initial condition", caseSpec.scenario.initial_conditions);
  assertUniqueIds(file, "observation", caseSpec.observations);
  assertUniqueIds(file, "criterion", caseSpec.criteria);

  const caseBehaviors = new Map(caseSpec.behaviors.map((entry) => [entry.id, new Set(entry.targets)]));
  for (const reference of caseSpec.behaviors) {
    const behavior = behaviors.get(reference.id);
    if (!behavior) throw new Error(`${file}: unknown behavior "${reference.id}"`);
    const failureModes = new Set(behavior.failure_modes.map((failure) => failure.id));
    for (const target of reference.targets) {
      if (!failureModes.has(target)) throw new Error(`${file}: behavior "${reference.id}" has no failure mode "${target}"`);
    }
  }

  const observationIds = new Set(caseSpec.observations.map((observation) => observation.id));
  for (const criterion of caseSpec.criteria) {
    const targets = caseBehaviors.get(criterion.behavior);
    if (!targets) throw new Error(`${file}: criterion "${criterion.id}" references undeclared behavior "${criterion.behavior}"`);
    for (const target of criterion.targets) {
      if (!targets.has(target)) throw new Error(`${file}: criterion "${criterion.id}" references untargeted failure mode "${target}"`);
    }
    for (const evidence of criterion.evidence) {
      if (!observationIds.has(evidence)) throw new Error(`${file}: criterion "${criterion.id}" references undeclared observation "${evidence}"`);
    }
  }

  sameKeys(runtime.preflight, caseSpec.scenario.initial_conditions.map((condition) => condition.id), "preflight", file);
  sameKeys(runtime.collectors, caseSpec.observations.map((observation) => observation.id), "collector", file);
  sameKeys(runtime.graders, caseSpec.criteria.map((criterion) => criterion.id), "grader", file);

  const supportedPreflights = new Set(["files-contain"]);
  const supportedCollectors = new Set(["pi-message-collector", "pi-tool-trajectory-collector"]);
  const supportedGraders = new Set(["semantic-criterion"]);
  for (const implementation of Object.values(runtime.preflight)) {
    if (!supportedPreflights.has(implementation.checker)) {
      throw new Error(`${file}: unsupported preflight implementation "${implementation.checker}"`);
    }
  }
  for (const implementation of Object.values(runtime.collectors)) {
    if (!supportedCollectors.has(implementation)) throw new Error(`${file}: unsupported collector implementation "${implementation}"`);
  }
  for (const implementation of Object.values(runtime.graders)) {
    if (!supportedGraders.has(implementation)) throw new Error(`${file}: unsupported grader implementation "${implementation}"`);
  }

  const fixture = path.resolve(path.dirname(file), runtime.fixture.source);
  const fixtureExists = await stat(fixture).then((result) => result.isDirectory()).catch(() => false);
  if (!fixtureExists) throw new Error(`${file}: fixture directory does not exist: ${fixture}`);
}

export async function loadCatalog(root: string): Promise<Catalog> {
  const absoluteRoot = path.resolve(root);
  const behaviors = new Map<string, BehaviorSpec>();
  for (const file of await yamlFiles(path.join(absoluteRoot, "behaviors"))) {
    const behavior = await readYaml(file, validateBehavior);
    assertUniqueIds(file, "applicability", behavior.applies_when);
    assertUniqueIds(file, "failure mode", behavior.failure_modes);
    if (behaviors.has(behavior.id)) throw new Error(`${file}: duplicate behavior "${behavior.id}"`);
    behaviors.set(behavior.id, behavior);
  }

  const systems = new Map<string, ConfiguredSystem>();
  for (const file of await yamlFiles(path.join(absoluteRoot, "systems"))) {
    const system = await readYaml(file, validateSystem);
    if (systems.has(system.id)) throw new Error(`${file}: duplicate system "${system.id}"`);
    systems.set(system.id, system);
  }

  const cases = new Map<string, CatalogCase>();
  const caseEntries = await readdir(path.join(absoluteRoot, "cases"), { withFileTypes: true });
  for (const entry of caseEntries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = path.join(absoluteRoot, "cases", entry.name);
    const caseFile = path.join(directory, "case.yaml");
    const runtimeFile = path.join(directory, "runtime.yaml");
    const caseSpec = await readYaml(caseFile, validateCase);
    const runtime = await readYaml(runtimeFile, validateRuntime);
    if (cases.has(caseSpec.id)) throw new Error(`${caseFile}: duplicate case "${caseSpec.id}"`);
    await validateCaseSemantics(caseFile, caseSpec, runtime, behaviors);
    cases.set(caseSpec.id, { spec: caseSpec, binding: runtime, directory });
  }

  if (behaviors.size === 0) throw new Error(`${absoluteRoot}: no behaviors found`);
  if (cases.size === 0) throw new Error(`${absoluteRoot}: no cases found`);
  if (systems.size === 0) throw new Error(`${absoluteRoot}: no configured systems found`);

  return { root: absoluteRoot, behaviors, cases, systems };
}
