export type EvidenceBoundary = "interaction" | "trajectory" | "environment";

export interface BehaviorSpec {
  schema_version: 1;
  id: string;
  title: string;
  statement: string;
  applies_when: Array<{ id: string; description: string }>;
  failure_modes: Array<{ id: string; description: string }>;
}

export interface CaseSpec {
  schema_version: 1;
  id: string;
  title: string;
  behaviors: Array<{ id: string; targets: string[] }>;
  scenario: {
    summary: string;
    initial_conditions: Array<{ id: string; description: string }>;
    interaction: {
      form: "single_turn" | "multi_turn";
      progression: "scripted";
      messages: Array<{ role: "user"; content: string; after?: "assistant_response" }>;
      stop_when: string[];
    };
  };
  observations: Array<{ id: string; boundary: EvidenceBoundary; description: string }>;
  criteria: Array<{
    id: string;
    behavior: string;
    targets: string[];
    evidence: string[];
    success: string;
    failure: string;
    consequence: "hard_gate" | "scored";
  }>;
}

export interface RuntimeBinding {
  schema_version: 1;
  case: string;
  profile: "scripted-pi-project";
  fixture: { source: string };
  preflight: Record<
    string,
    {
      checker: "files-contain";
      files: Array<{ path: string; contains: string[] }>;
    }
  >;
  collectors: Record<string, string>;
  graders: Record<string, string>;
}

export interface ConfiguredSystem {
  schema_version: 1;
  id: string;
  model: {
    provider: string;
    id: string;
    thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  };
  resources: {
    extensions: string[];
    skills: string[];
    context_files: string[];
  };
  tools: string[];
}

export interface CatalogCase {
  spec: CaseSpec;
  binding: RuntimeBinding;
  directory: string;
}

export interface Catalog {
  root: string;
  behaviors: Map<string, BehaviorSpec>;
  cases: Map<string, CatalogCase>;
  systems: Map<string, ConfiguredSystem>;
}

export interface Evidence {
  id: string;
  boundary: EvidenceBoundary;
  value: unknown;
}

export interface TrialError {
  stage: "fixture" | "preflight" | "session" | "driver" | "evidence" | "cleanup";
  message: string;
  stack?: string;
}

export interface TrialArtifact {
  schema_version: 2;
  identity: {
    run_id: string;
    case_id: string;
    system_id: string;
    trial_index: number;
  };
  configuration: {
    model: ConfiguredSystem["model"];
    resources: ConfiguredSystem["resources"];
    tools: string[];
    harness_version: string;
    pi_version: string;
    repository: { commit: string | null; dirty: boolean | null };
  };
  validity: "valid" | "invalid";
  behavior: "unknown";
  evidence: Evidence[];
  grades: Array<{
    criterion_id: string;
    behavior: "unknown";
    grader: "pending_human";
    reason: string;
  }>;
  cleanup: { status: "pass" | "fail"; message?: string };
  usage: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache_read?: number;
    cache_write?: number;
    total?: number;
    cost_total?: number;
  };
  duration_ms: number;
  errors: TrialError[];
}
