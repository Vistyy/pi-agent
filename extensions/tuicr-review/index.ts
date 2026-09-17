import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { ReviewCommands } from "./src/commands.ts";
import { GuidedReview } from "./src/review.ts";

const Side = StringEnum(["old", "new"] as const);
const Target = Type.Union([
  Type.Object({ kind: StringEnum(["workingTree"] as const) }, { additionalProperties: false }),
  Type.Object({
    kind: StringEnum(["revisions"] as const),
    revset: Type.String({ minLength: 1, pattern: "\\S" }),
    includeWorkingTree: Type.Optional(Type.Boolean()),
  }, { additionalProperties: false }),
]);
const content = Type.String({ minLength: 1, pattern: "\\S" });
const file = Type.String({ minLength: 1, pattern: "\\S" });
const Annotation = Type.Union([
  Type.Object({ kind: StringEnum(["review"] as const), content }, { additionalProperties: false }),
  Type.Object({ kind: StringEnum(["file"] as const), file, content }, { additionalProperties: false }),
  Type.Object({
    kind: StringEnum(["line"] as const), file, line: Type.Integer({ minimum: 1 }), side: Type.Optional(Side), content,
  }, { additionalProperties: false }),
  Type.Object({
    kind: StringEnum(["range"] as const), file, startLine: Type.Integer({ minimum: 1 }),
    endLine: Type.Integer({ minimum: 1 }), side: Type.Optional(Side), content,
  }, { additionalProperties: false }),
]);

export const TuicrReviewParameters = Type.Object({
  cwd: Type.Optional(Type.String({ minLength: 1, pattern: "\\S" })),
  target: Target,
  annotations: Type.Optional(Type.Array(Annotation)),
}, { additionalProperties: false });
export type TuicrReviewInput = Static<typeof TuicrReviewParameters>;

export default function tuicrReview(pi: ExtensionAPI): void {
  const commands = new ReviewCommands(pi);
  const review = new GuidedReview(pi, commands);

  pi.registerTool({
    name: "tuicr_review",
    label: "Tuicr Review",
    description: [
      "Open or update one guided Tuicr review in a dedicated Herdr tab and return when it is ready.",
      "Annotations are optional. Use them when colocated context improves the review: explain intent or constraints,",
      "surface meaningful risks or trade-offs, highlight non-obvious decisions, or ask focused questions.",
      "Choose the narrowest useful review, file, line, or range scope; any number of annotations, including none, is valid.",
    ].join(" "),
    promptSnippet: "Open or add useful context to a guided Tuicr review",
    promptGuidelines: [
      "Inspect the target change before opening the review. Use annotations as an authored review layer when colocated context will help the Maintainer judge intent, constraints, risks, trade-offs, non-obvious decisions, or focused questions.",
      "Place each annotation at the narrowest useful review, file, line, or range scope. Add as many as materially improve the review, including none; do not treat scopes or annotation counts as a checklist.",
      "When structure clarifies an annotation, use the smallest fitting form: pseudocode for logic, a call tree for runtime flow, a shallow file tree for ownership, Mermaid for interactions or data movement, or a fenced diff for changes. Use prose when clearer and do not repeat the same point in multiple forms.",
    ],
    parameters: TuicrReviewParameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await review.ensure(params, ctx, signal);
      const failures = result.failures.length
        ? ` Annotation failures (${result.failures.length}): ${result.failures.join(" | ")}`
        : "";
      return {
        content: [{
          type: "text" as const,
          text: `${result.reused ? "Reused" : "Opened"} Tuicr session ${result.sessionId}. Accepted annotation IDs: ${result.acceptedCommentIds.join(", ") || "none"}.${failures}`,
        }],
        details: result,
      };
    },
  });

  pi.on("session_start", async (_event, ctx) => review.restore(ctx));
  pi.on("session_tree", async (_event, ctx) => review.tree(ctx));
  pi.on("session_shutdown", () => review.shutdown());
}
