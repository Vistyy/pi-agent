const nonEmptyString = { type: "string", minLength: 1 } as const;
const idString = { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" } as const;

const identifiedDescription = {
  type: "object",
  additionalProperties: false,
  required: ["id", "description"],
  properties: {
    id: idString,
    description: nonEmptyString,
  },
} as const;

export const behaviorSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "id", "title", "statement", "applies_when", "failure_modes"],
  properties: {
    schema_version: { const: 1 },
    id: idString,
    title: nonEmptyString,
    statement: nonEmptyString,
    applies_when: { type: "array", minItems: 1, items: identifiedDescription },
    failure_modes: { type: "array", minItems: 1, items: identifiedDescription },
  },
} as const;

export const caseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "id", "title", "behaviors", "scenario", "observations", "criteria"],
  properties: {
    schema_version: { const: 1 },
    id: idString,
    title: nonEmptyString,
    behaviors: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "targets"],
        properties: {
          id: idString,
          targets: { type: "array", minItems: 1, items: idString, uniqueItems: true },
        },
      },
    },
    scenario: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "initial_conditions", "interaction"],
      properties: {
        summary: nonEmptyString,
        initial_conditions: { type: "array", minItems: 1, items: identifiedDescription },
        interaction: {
          type: "object",
          additionalProperties: false,
          required: ["form", "progression", "messages", "stop_when"],
          properties: {
            form: { enum: ["single_turn", "multi_turn"] },
            progression: { const: "scripted" },
            messages: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["role", "content"],
                properties: {
                  role: { const: "user" },
                  content: nonEmptyString,
                  after: { const: "assistant_response" },
                },
              },
            },
            stop_when: { type: "array", minItems: 1, items: nonEmptyString },
          },
        },
      },
    },
    observations: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "boundary", "description"],
        properties: {
          id: idString,
          boundary: { enum: ["interaction", "trajectory", "environment"] },
          description: nonEmptyString,
        },
      },
    },
    criteria: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "behavior", "targets", "evidence", "success", "failure", "consequence"],
        properties: {
          id: idString,
          behavior: idString,
          targets: { type: "array", minItems: 1, items: idString, uniqueItems: true },
          evidence: { type: "array", minItems: 1, items: idString, uniqueItems: true },
          success: nonEmptyString,
          failure: nonEmptyString,
          consequence: { enum: ["hard_gate", "scored"] },
        },
      },
    },
  },
} as const;

const stringMap = {
  type: "object",
  minProperties: 1,
  additionalProperties: nonEmptyString,
} as const;

const graderMap = {
  type: "object",
  minProperties: 1,
  additionalProperties: {
    type: "object",
    additionalProperties: false,
    required: ["implementation", "evidence_gate"],
    properties: {
      implementation: { const: "evidence-gated-semantic-criterion" },
      evidence_gate: {
        type: "object",
        additionalProperties: false,
        required: ["checker", "observation", "interaction_turn", "artifacts"],
        properties: {
          checker: { const: "successful-tool-results-contain" },
          observation: idString,
          interaction_turn: { type: "integer", minimum: 1 },
          artifacts: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "contains"],
              properties: {
                id: idString,
                contains: { type: "array", minItems: 1, uniqueItems: true, items: nonEmptyString },
              },
            },
          },
        },
      },
    },
  },
} as const;

const preflightMap = {
  type: "object",
  minProperties: 1,
  additionalProperties: {
    type: "object",
    additionalProperties: false,
    required: ["checker", "files"],
    properties: {
      checker: { const: "files-contain" },
      files: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["path", "contains"],
          properties: {
            path: nonEmptyString,
            contains: { type: "array", minItems: 1, items: nonEmptyString, uniqueItems: true },
          },
        },
      },
    },
  },
} as const;

export const runtimeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "case", "profile", "fixture", "preflight", "collectors", "graders"],
  properties: {
    schema_version: { const: 1 },
    case: idString,
    profile: { const: "scripted-pi-project" },
    fixture: {
      type: "object",
      additionalProperties: false,
      required: ["source"],
      properties: { source: nonEmptyString },
    },
    preflight: preflightMap,
    collectors: stringMap,
    graders: graderMap,
  },
} as const;

const interactionMessage = {
  type: "object",
  additionalProperties: false,
  required: ["role", "text"],
  properties: {
    role: { enum: ["user", "assistant"] },
    text: nonEmptyString,
  },
} as const;

const calibrationOrigin = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "run_id", "trial_index"],
      properties: {
        kind: { const: "captured" },
        run_id: nonEmptyString,
        trial_index: { type: "integer", minimum: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: { kind: { const: "synthetic" } },
    },
  ],
} as const;

const trajectoryEntry = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "interaction_turn", "tool_call_id", "tool_name", "args"],
      properties: {
        type: { const: "tool_execution_start" },
        interaction_turn: { type: "integer", minimum: 1 },
        tool_call_id: nonEmptyString,
        tool_name: nonEmptyString,
        args: {},
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["type", "interaction_turn", "tool_call_id", "tool_name", "result", "is_error"],
      properties: {
        type: { const: "tool_execution_end" },
        interaction_turn: { type: "integer", minimum: 1 },
        tool_call_id: nonEmptyString,
        tool_name: nonEmptyString,
        result: {},
        is_error: { type: "boolean" },
      },
    },
  ],
} as const;

const calibrationEvidence = {
  type: "object",
  additionalProperties: false,
  required: ["id", "boundary", "value"],
  properties: {
    id: idString,
    boundary: { enum: ["interaction", "trajectory", "environment"] },
    value: {},
  },
} as const;

export const semanticJudgmentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["behavior", "reason", "citations"],
  properties: {
    behavior: { enum: ["pass", "fail", "unknown"] },
    reason: nonEmptyString,
    citations: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "quote"],
        properties: {
          source: nonEmptyString,
          quote: nonEmptyString,
        },
      },
    },
    diagnostic: idString,
  },
} as const;

export const calibrationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "behavior_id",
    "case_id",
    "criterion",
    "diagnostics",
    "trajectory_fixtures",
    "semantic_samples",
    "validity_samples",
  ],
  properties: {
    schema_version: { const: 1 },
    behavior_id: idString,
    case_id: idString,
    criterion: {
      type: "object",
      additionalProperties: false,
      required: ["id", "claim", "pass", "fail"],
      properties: {
        id: idString,
        claim: nonEmptyString,
        pass: nonEmptyString,
        fail: nonEmptyString,
      },
    },
    diagnostics: { type: "array", minItems: 1, uniqueItems: true, items: idString },
    trajectory_fixtures: {
      type: "object",
      minProperties: 1,
      propertyNames: idString,
      additionalProperties: { type: "array", items: trajectoryEntry },
    },
    semantic_samples: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "origin", "trajectory_fixture", "interaction", "expected"],
        properties: {
          id: idString,
          origin: calibrationOrigin,
          trajectory_fixture: idString,
          interaction: { type: "array", minItems: 1, items: interactionMessage },
          expected: {
            type: "object",
            additionalProperties: false,
            required: ["behavior", "diagnostic"],
            properties: {
              behavior: { enum: ["pass", "fail"] },
              diagnostic: idString,
            },
          },
        },
      },
    },
    validity_samples: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "origin", "evidence", "expected_validity"],
        properties: {
          id: idString,
          origin: {
            type: "object",
            additionalProperties: false,
            required: ["kind"],
            properties: { kind: { const: "synthetic" } },
          },
          evidence: { type: "array", minItems: 1, items: calibrationEvidence },
          expected_validity: { const: "invalid" },
        },
      },
    },
  },
} as const;

export const systemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "id", "model", "resources", "tools"],
  properties: {
    schema_version: { const: 1 },
    id: idString,
    model: {
      type: "object",
      additionalProperties: false,
      required: ["provider", "id", "thinking_level"],
      properties: {
        provider: nonEmptyString,
        id: nonEmptyString,
        thinking_level: { enum: ["off", "minimal", "low", "medium", "high", "xhigh", "max"] },
      },
    },
    resources: {
      type: "object",
      additionalProperties: false,
      required: ["extensions", "skills", "context_files"],
      properties: {
        extensions: { type: "array", items: nonEmptyString, uniqueItems: true },
        skills: { type: "array", items: nonEmptyString, uniqueItems: true },
        context_files: { type: "array", items: nonEmptyString, uniqueItems: true },
      },
    },
    tools: { type: "array", minItems: 1, items: nonEmptyString, uniqueItems: true },
  },
} as const;
