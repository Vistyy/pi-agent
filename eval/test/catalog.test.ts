import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parse, stringify } from "yaml";

import { loadCatalog } from "../src/catalog.js";

const evalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function temporaryCatalog(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-eval-catalog-"));
  await Promise.all([
    cp(path.join(evalRoot, "behaviors"), path.join(root, "behaviors"), { recursive: true }),
    cp(path.join(evalRoot, "cases"), path.join(root, "cases"), { recursive: true }),
    cp(path.join(evalRoot, "systems"), path.join(root, "systems"), { recursive: true }),
  ]);
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("loads the behavior-first catalog", async () => {
  const catalog = await loadCatalog(evalRoot);
  assert.deepEqual([...catalog.behaviors.keys()], ["reconstruct-relevant-context"]);
  assert.deepEqual([...catalog.cases.keys()], ["choose-reconnection-state-owner"]);
  assert.deepEqual([...catalog.systems.keys()], ["luna-medium", "sol-medium"]);
});

test("rejects execution configuration in a case manifest", async () => {
  const fixture = await temporaryCatalog();
  try {
    const file = path.join(fixture.root, "cases", "choose-reconnection-state-owner", "case.yaml");
    const value = parse(await readFile(file, "utf8"));
    value.model = "gpt-5.6-sol";
    await writeFile(file, stringify(value), "utf8");
    await assert.rejects(loadCatalog(fixture.root), /additional properties/u);
  } finally {
    await fixture.cleanup();
  }
});

test("requires one collector for every declared observation", async () => {
  const fixture = await temporaryCatalog();
  try {
    const file = path.join(fixture.root, "cases", "choose-reconnection-state-owner", "runtime.yaml");
    const value = parse(await readFile(file, "utf8"));
    delete value.collectors["repository-inspection"];
    await writeFile(file, stringify(value), "utf8");
    await assert.rejects(loadCatalog(fixture.root), /collector keys must be exactly/u);
  } finally {
    await fixture.cleanup();
  }
});

test("rejects failure modes not declared by the behavior", async () => {
  const fixture = await temporaryCatalog();
  try {
    const file = path.join(fixture.root, "cases", "choose-reconnection-state-owner", "case.yaml");
    const value = parse(await readFile(file, "utf8"));
    value.behaviors[0].targets = ["invented-failure"];
    value.criteria[0].targets = ["invented-failure"];
    await writeFile(file, stringify(value), "utf8");
    await assert.rejects(loadCatalog(fixture.root), /has no failure mode "invented-failure"/u);
  } finally {
    await fixture.cleanup();
  }
});
