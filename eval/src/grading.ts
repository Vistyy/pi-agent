import { Ajv } from "ajv";

import { semanticJudgmentSchema } from "./schemas.js";
import type { CaseSpec, Evidence, RuntimeBinding } from "./types.js";

export type BehaviorGrade = "pass" | "fail" | "unknown";
export type GraderValidity = "valid" | "invalid" | "challenged";

export interface EvidenceCitation {
  source: string;
  quote: string;
}

export interface EvidenceGateResult {
  status: "pass" | "fail" | "unknown";
  observed_artifacts: string[];
  missing_artifacts: string[];
  citations: EvidenceCitation[];
  reason: string;
  diagnostic?: "no-evidence" | "partial-evidence";
}

export interface SemanticJudgment {
  behavior: BehaviorGrade;
  reason: string;
  citations: EvidenceCitation[];
  diagnostic?: string;
}

export interface SemanticJudgeRequest {
  criterion: {
    id: string;
    success: string;
    failure: string;
  };
  evidence: Array<{ source: string; content: string }>;
  allowed_diagnostics: string[];
}

export interface SemanticJudge {
  readonly identity: {
    id: string;
    revision: string;
    prompt_revision: string;
    model: { provider: string; id: string; thinking_level: string };
  };
  judge(request: SemanticJudgeRequest): Promise<SemanticJudgment>;
}

export interface CriterionGrade {
  criterion_id: string;
  behavior: BehaviorGrade;
  grader_validity: GraderValidity;
  grader: SemanticJudge["identity"];
  reason: string;
  diagnostic?: string;
  citations: EvidenceCitation[];
  components: {
    evidence_gate: EvidenceGateResult;
    semantic_judgment: SemanticJudgment | null;
  };
}

const ajv = new Ajv({ allErrors: true, strict: true });
const validateSemanticJudgment = ajv.compile<SemanticJudgment>(semanticJudgmentSchema);

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textContent).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  return Object.values(value as Record<string, unknown>).map(textContent).filter(Boolean).join("\n");
}

function trajectoryEntries(evidence: Evidence[], observation: string): unknown[] | undefined {
  const matches = evidence.filter((entry) => entry.id === observation && entry.boundary === "trajectory");
  if (matches.length !== 1 || !Array.isArray(matches[0]?.value)) return undefined;
  return matches[0].value;
}

export function validateCriterionEvidence(
  criterion: CaseSpec["criteria"][number],
  evidence: Evidence[],
): { validity: "valid" | "invalid"; reason: string } {
  for (const evidenceId of criterion.evidence) {
    const count = evidence.filter((entry) => entry.id === evidenceId).length;
    if (count !== 1) {
      return {
        validity: "invalid",
        reason: count === 0
          ? `Required criterion evidence is missing: ${evidenceId}`
          : `Required criterion evidence is duplicated: ${evidenceId}`,
      };
    }
  }
  return { validity: "valid", reason: "Every evidence item required by the criterion is present exactly once." };
}

export function checkEvidenceGate(
  evidence: Evidence[],
  gate: RuntimeBinding["graders"][string]["evidence_gate"],
): EvidenceGateResult {
  const trajectory = trajectoryEntries(evidence, gate.observation);
  const artifactIds = gate.artifacts.map((artifact) => artifact.id);
  if (!trajectory) {
    return {
      status: "unknown",
      observed_artifacts: [],
      missing_artifacts: artifactIds,
      citations: [],
      reason: `Trajectory evidence is unavailable or malformed: ${gate.observation}`,
    };
  }

  const successfulResults = trajectory.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    if (
      candidate.type !== "tool_execution_end"
      || candidate.interaction_turn !== gate.interaction_turn
      || candidate.is_error !== false
      || typeof candidate.tool_call_id !== "string"
    ) return [];
    return [{ index, toolCallId: candidate.tool_call_id, content: textContent(candidate.result) }];
  });

  const citations: EvidenceCitation[] = [];
  const observedArtifacts: string[] = [];
  for (const artifact of gate.artifacts) {
    const result = successfulResults.find((candidate) =>
      artifact.contains.every((requiredText) => candidate.content.includes(requiredText)),
    );
    if (!result) continue;
    observedArtifacts.push(artifact.id);
    citations.push({
      source: `${gate.observation}:${result.index}`,
      quote: `${artifact.id} retrieved by tool call ${result.toolCallId}`,
    });
  }

  const observed = new Set(observedArtifacts);
  const missingArtifacts = artifactIds.filter((id) => !observed.has(id));
  if (missingArtifacts.length === 0) {
    return {
      status: "pass",
      observed_artifacts: observedArtifacts,
      missing_artifacts: [],
      citations,
      reason: "Every decisive artifact was retrieved in the required interaction turn.",
    };
  }

  return {
    status: "fail",
    observed_artifacts: observedArtifacts,
    missing_artifacts: missingArtifacts,
    citations,
    reason: `Decisive artifacts were not retrieved before the recommendation: ${missingArtifacts.join(", ")}`,
    diagnostic: observedArtifacts.length === 0 ? "no-evidence" : "partial-evidence",
  };
}

export function parseSemanticJudgment(value: unknown, suppliedEvidence: Map<string, string>): SemanticJudgment {
  if (!validateSemanticJudgment(value)) {
    const details = (validateSemanticJudgment.errors ?? [])
      .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
      .join("; ");
    throw new Error(`Judge returned an invalid structured result: ${details}`);
  }
  for (const citation of value.citations) {
    const content = suppliedEvidence.get(citation.source);
    if (content === undefined) {
      throw new Error(`Judge cited evidence that was not supplied: ${citation.source}`);
    }
    if (!content.includes(citation.quote)) {
      throw new Error(`Judge quote does not occur in supplied evidence "${citation.source}": ${citation.quote}`);
    }
  }
  return value;
}

export async function gradeCriterion(options: {
  criterion: CaseSpec["criteria"][number];
  evidence: Evidence[];
  gate: RuntimeBinding["graders"][string]["evidence_gate"];
  judge: SemanticJudge;
  allowedDiagnostics: string[];
}): Promise<CriterionGrade> {
  const gate = checkEvidenceGate(options.evidence, options.gate);
  const base = {
    criterion_id: options.criterion.id,
    grader: options.judge.identity,
    citations: gate.citations,
  };

  if (gate.status === "unknown") {
    return {
      ...base,
      behavior: "unknown",
      grader_validity: "valid",
      reason: gate.reason,
      components: { evidence_gate: gate, semantic_judgment: null },
    };
  }
  if (gate.status === "fail") {
    return {
      ...base,
      behavior: "fail",
      grader_validity: "valid",
      reason: gate.reason,
      diagnostic: gate.diagnostic,
      components: { evidence_gate: gate, semantic_judgment: null },
    };
  }

  const suppliedEvidence = options.evidence.map((entry) => ({
    source: entry.id,
    content: textContent(entry.value),
  }));
  try {
    const judgment = await options.judge.judge({
      criterion: {
        id: options.criterion.id,
        success: options.criterion.success,
        failure: options.criterion.failure,
      },
      evidence: suppliedEvidence,
      allowed_diagnostics: options.allowedDiagnostics,
    });
    const suppliedSources = new Map(suppliedEvidence.map((entry) => [entry.source, entry.content]));
    const parsed = parseSemanticJudgment(judgment, suppliedSources);
    if (parsed.diagnostic && !options.allowedDiagnostics.includes(parsed.diagnostic)) {
      throw new Error(`Judge returned an unsupported diagnostic: ${parsed.diagnostic}`);
    }
    return {
      ...base,
      behavior: parsed.behavior,
      grader_validity: "valid",
      reason: parsed.reason,
      ...(parsed.diagnostic ? { diagnostic: parsed.diagnostic } : {}),
      citations: parsed.citations,
      components: { evidence_gate: gate, semantic_judgment: parsed },
    };
  } catch (error) {
    return {
      ...base,
      behavior: "unknown",
      grader_validity: "invalid",
      reason: error instanceof Error ? error.message : String(error),
      components: { evidence_gate: gate, semantic_judgment: null },
    };
  }
}
