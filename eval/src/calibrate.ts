import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { gradeCriterion, validateCriterionEvidence } from "./grading.js";
import { PiSemanticJudge } from "./pi-semantic-judge.js";
import type { Catalog, Evidence, LoadedCalibrationSet } from "./types.js";

interface CalibrationOptions {
  catalog: Catalog;
  calibrations: LoadedCalibrationSet[];
  repositoryRoot: string;
  outputRoot: string;
  promptFile: string;
  promptRevision: string;
  judgeModel: {
    provider: string;
    id: string;
    thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  };
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export async function runCalibration(options: CalibrationOptions): Promise<{ directory: string; accepted: boolean }> {
  const judge = await PiSemanticJudge.create({
    repositoryRoot: options.repositoryRoot,
    promptFile: options.promptFile,
    promptRevision: options.promptRevision,
    model: options.judgeModel,
  });
  const id = `${new Date().toISOString().replace(/[:.]/gu, "-")}_${options.judgeModel.provider}_${options.judgeModel.id.replaceAll("/", "-")}`;
  const directory = path.join(options.outputRoot, "calibration", id);
  await mkdir(directory, { recursive: true });

  const setResults = [];
  let expectedBehaviorLabels = 0;
  let matchingBehaviorLabels = 0;
  let invalidGraderResults = 0;
  let expectedValidityLabels = 0;
  let matchingValidityLabels = 0;

  for (const loaded of options.calibrations) {
    const calibration = loaded.set;
    const catalogCase = options.catalog.cases.get(calibration.case_id);
    if (!catalogCase) throw new Error(`Calibration references unknown case: ${calibration.case_id}`);
    const criterion = catalogCase.spec.criteria.find((entry) => entry.id === calibration.criterion.id);
    const grader = catalogCase.binding.graders[calibration.criterion.id];
    if (!criterion || !grader) throw new Error(`Calibration criterion is not executable: ${calibration.criterion.id}`);

    const interactionObservations = catalogCase.spec.observations.filter(
      (entry) => criterion.evidence.includes(entry.id) && entry.boundary === "interaction",
    );
    if (interactionObservations.length !== 1) {
      throw new Error(`Calibration requires exactly one interaction observation: ${calibration.criterion.id}`);
    }
    const interactionObservation = interactionObservations[0]!;

    const semanticResults = [];
    for (const sample of calibration.semantic_samples) {
      const evidence: Evidence[] = [
        { id: interactionObservation.id, boundary: "interaction", value: sample.interaction },
        {
          id: grader.evidence_gate.observation,
          boundary: "trajectory",
          value: calibration.trajectory_fixtures[sample.trajectory_fixture],
        },
      ];
      const evidenceValidity = validateCriterionEvidence(criterion, evidence);
      if (evidenceValidity.validity !== "valid") {
        throw new Error(`Semantic calibration sample "${sample.id}" is invalid: ${evidenceValidity.reason}`);
      }
      const grade = await gradeCriterion({
        criterion,
        evidence,
        gate: grader.evidence_gate,
        judge,
        allowedDiagnostics: calibration.diagnostics,
      });
      const behaviorMatches = grade.behavior === sample.expected.behavior;
      expectedBehaviorLabels += 1;
      if (behaviorMatches) matchingBehaviorLabels += 1;
      if (grade.grader_validity === "invalid") invalidGraderResults += 1;
      semanticResults.push({
        sample_id: sample.id,
        expected: sample.expected,
        predicted: grade,
        behavior_matches: behaviorMatches,
        diagnostic_matches: grade.diagnostic === sample.expected.diagnostic,
      });
    }

    const validityResults = calibration.validity_samples.map((sample) => {
      const actual = validateCriterionEvidence(criterion, sample.evidence).validity;
      const matches = actual === sample.expected_validity;
      expectedValidityLabels += 1;
      if (matches) matchingValidityLabels += 1;
      return {
        sample_id: sample.id,
        expected: sample.expected_validity,
        actual,
        matches,
      };
    });

    setResults.push({
      calibration_file: path.relative(options.catalog.root, loaded.file),
      schema_version: calibration.schema_version,
      behavior_id: calibration.behavior_id,
      case_id: calibration.case_id,
      criterion_id: calibration.criterion.id,
      semantic_results: semanticResults,
      validity_results: validityResults,
    });
  }

  const threshold = {
    required_behavior_agreement: 1,
    required_validity_agreement: 1,
    maximum_invalid_grader_results: 0,
  };
  const behaviorAgreement = expectedBehaviorLabels === 0 ? 0 : matchingBehaviorLabels / expectedBehaviorLabels;
  const validityAgreement = expectedValidityLabels === 0 ? 0 : matchingValidityLabels / expectedValidityLabels;
  const accepted = behaviorAgreement >= threshold.required_behavior_agreement
    && validityAgreement >= threshold.required_validity_agreement
    && invalidGraderResults <= threshold.maximum_invalid_grader_results;

  await writeJsonAtomic(path.join(directory, "result.json"), {
    schema_version: 1,
    created_at: new Date().toISOString(),
    judge: judge.identity,
    threshold,
    summary: {
      expected_behavior_labels: expectedBehaviorLabels,
      matching_behavior_labels: matchingBehaviorLabels,
      behavior_agreement: behaviorAgreement,
      expected_validity_labels: expectedValidityLabels,
      matching_validity_labels: matchingValidityLabels,
      validity_agreement: validityAgreement,
      invalid_grader_results: invalidGraderResults,
      accepted,
    },
    calibration_sets: setResults,
  });

  return { directory, accepted };
}
