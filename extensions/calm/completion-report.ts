import { Type } from "typebox";
import { Value } from "typebox/value";

const PREFIX = "PSTACK_CHILD_REPORT_V1\n";

const fullReport = Type.Object(
  { kind: Type.Literal("full"), text: Type.String() },
  { additionalProperties: false },
);

const previewReport = Type.Object(
  {
    kind: Type.Literal("preview"),
    text: Type.String(),
    omittedBytes: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

const envelope = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    attempt: Type.Integer({ minimum: 1 }),
    status: Type.Union([Type.Literal("completed"), Type.Literal("failed")]),
    report: Type.Union([fullReport, previewReport]),
  },
  { additionalProperties: false },
);

export function isCompletionReportEnvelope(text: unknown): boolean {
  if (typeof text !== "string" || !text.startsWith(PREFIX)) return false;
  const payload = text.slice(PREFIX.length);

  // JSON.parse tolerates whitespace around the object; the protocol allows none.
  if (!payload.startsWith("{") || !payload.endsWith("}")) return false;
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }

  return Value.Check(envelope, parsed);
}
