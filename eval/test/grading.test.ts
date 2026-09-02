import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadCalibrationSets } from "../src/calibration.js";
import { loadCatalog } from "../src/catalog.js";
import { checkEvidenceGate, gradeCriterion, validateCriterionEvidence, type SemanticJudge } from "../src/grading.js";
import type { CalibrationSet, CaseSpec, Evidence, RuntimeBinding } from "../src/types.js";

const evalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function subject(): Promise<{
  calibration: CalibrationSet;
  criterion: CaseSpec["criteria"][number];
  gate: RuntimeBinding["graders"][string]["evidence_gate"];
}> {
  const catalog = await loadCatalog(evalRoot);
  const [loaded] = await loadCalibrationSets(evalRoot, catalog);
  const catalogCase = catalog.cases.get("choose-reconnection-state-owner");
  assert(loaded && catalogCase);
  return {
    calibration: loaded.set,
    criterion: catalogCase.spec.criteria[0]!,
    gate: catalogCase.binding.graders["evidence-grounded-lifecycle-recommendation"]!.evidence_gate,
  };
}

function sampleEvidence(calibration: CalibrationSet, sampleId: string): Evidence[] {
  const sample = calibration.semantic_samples.find((entry) => entry.id === sampleId);
  assert(sample);
  return [
    { id: "decision-conversation", boundary: "interaction", value: sample.interaction },
    {
      id: "repository-inspection",
      boundary: "trajectory",
      value: calibration.trajectory_fixtures[sample.trajectory_fixture],
    },
  ];
}

function judge(judgment: Awaited<ReturnType<SemanticJudge["judge"]>>): SemanticJudge {
  return {
    identity: {
      id: "test-semantic-judge",
      revision: "1",
      prompt_revision: "1",
      model: { provider: "test", id: "judge", thinking_level: "off" },
    },
    async judge() {
      return judgment;
    },
  };
}

test("evidence gate distinguishes complete, partial, and absent decisive evidence", async () => {
  const { calibration, gate } = await subject();

  const complete = checkEvidenceGate(sampleEvidence(calibration, "complete-correct-real"), gate);
  assert.equal(complete.status, "pass");
  assert.deepEqual(complete.missing_artifacts, []);

  const partial = checkEvidenceGate(sampleEvidence(calibration, "partial-coordinator-lucky-answer"), gate);
  assert.equal(partial.status, "fail");
  assert.equal(partial.diagnostic, "partial-evidence");
  assert.deepEqual(partial.observed_artifacts, ["session-coordinator-lifecycle"]);

  const absent = checkEvidenceGate(sampleEvidence(calibration, "no-investigation-follows-preference"), gate);
  assert.equal(absent.status, "fail");
  assert.equal(absent.diagnostic, "no-evidence");
});

test("missing trajectory evidence invalidates the packet before semantic grading", async () => {
  const { calibration, criterion } = await subject();
  const sample = calibration.validity_samples[0];
  assert(sample);

  assert.deepEqual(validateCriterionEvidence(criterion, sample.evidence), {
    validity: "invalid",
    reason: "Required criterion evidence is missing: repository-inspection",
  });
});

test("hard evidence failure bypasses the semantic judge", async () => {
  const { calibration, criterion, gate } = await subject();
  let calls = 0;
  const semanticJudge = judge({
    behavior: "pass",
    reason: "Should not run.",
    citations: [{ source: "decision-conversation", quote: "unused" }],
  });
  semanticJudge.judge = async (request) => {
    calls += 1;
    return judge({ behavior: "pass", reason: "unused", citations: [] }).judge(request);
  };

  const grade = await gradeCriterion({
    criterion,
    evidence: sampleEvidence(calibration, "partial-coordinator-lucky-answer"),
    gate,
    judge: semanticJudge,
    allowedDiagnostics: calibration.diagnostics,
  });

  assert.equal(calls, 0);
  assert.equal(grade.behavior, "fail");
  assert.equal(grade.diagnostic, "partial-evidence");
  assert.equal(grade.components.semantic_judgment, null);
});

test("valid semantic judgment controls behavior only after the evidence gate passes", async () => {
  const { calibration, criterion, gate } = await subject();
  const grade = await gradeCriterion({
    criterion,
    evidence: sampleEvidence(calibration, "complete-correct-real"),
    gate,
    judge: judge({
      behavior: "pass",
      reason: "The response accurately applies the lifecycle evidence.",
      citations: [{ source: "decision-conversation", quote: "WorkspaceRuntime" }],
      diagnostic: "none",
    }),
    allowedDiagnostics: calibration.diagnostics,
  });

  assert.equal(grade.behavior, "pass");
  assert.equal(grade.grader_validity, "valid");
  assert.equal(grade.components.evidence_gate.status, "pass");
  assert.equal(grade.components.semantic_judgment?.behavior, "pass");
});

test("unsupported judge citations produce an unknown grade and invalid grader", async () => {
  const { calibration, criterion, gate } = await subject();
  const grade = await gradeCriterion({
    criterion,
    evidence: sampleEvidence(calibration, "complete-correct-real"),
    gate,
    judge: judge({
      behavior: "pass",
      reason: "Uses hidden evidence.",
      citations: [{ source: "expected-answer", quote: "SessionCoordinator" }],
    }),
    allowedDiagnostics: calibration.diagnostics,
  });

  assert.equal(grade.behavior, "unknown");
  assert.equal(grade.grader_validity, "invalid");
  assert.match(grade.reason, /not supplied/u);
});
