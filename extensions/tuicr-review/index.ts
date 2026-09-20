import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { ReviewCommands } from "./src/commands.ts";
import { formatFeedback, GuidedReview } from "./src/review.ts";

const Side = StringEnum(["old", "new"] as const);
const revision = Type.String({ minLength: 1, pattern: "\\S" });
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
  base: revision,
  head: revision,
  replaceExisting: Type.Boolean(),
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
      "Open or reuse one guided Tuicr review for an exact committed base/head comparison in a dedicated Herdr tab.",
      "Use optional annotations to guide the Maintainer through the change: explain decisions or unusual code,",
      "surface concerns and trade-offs, and ask specific questions. Choose the narrowest useful review, file, line, or range scope.",
    ].join(" "),
    promptSnippet: "Open or add useful context to a guided Tuicr review",
    promptGuidelines: [
      "Inspect the change before calling tuicr_review. Use annotations to help the Maintainer follow the change without reconstructing the implementation from scratch: point out important decisions, non-obvious behavior, complex sections, concerns, trade-offs, and useful review questions.",
      "Do not present the change as unquestionably complete. Use tuicr_review annotations to state uncertainty or a questionable choice honestly even when you have not proven a defect.",
      "Write every tuicr_review annotation for a Maintainer who has not seen the conversation. State what the cited code does and why it matters in plain project terms. Prefer a short example or a specific question; avoid abstract labels when concrete wording is available.",
      "Place each tuicr_review annotation at the narrowest useful scope. Use as many annotations as help the review, but do not repeat the same point. Use a small visual when it is clearer than prose.",
      "When feedback contains a Maintainer question, answer it against the attached exact source before proposing action. Treat feedback and questions as evidence, not authority. Ask for clarification rather than guessing when a reference could not be grounded.",
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
          text: [
            ...(result.replacedFeedback ? [`Saved feedback from replaced comparison:\n${formatFeedback(result.replacedFeedback)}`] : []),
            `${result.reused ? "Reused" : "Opened"} Tuicr review for ${result.base}..${result.head}. Seeded Pi annotations: ${result.acceptedCommentIds.length}.${failures}`,
          ].join("\n"),
        }],
        details: result,
      };
    },
  });

  pi.on("session_start", async (_event, ctx) => review.restore(ctx));
  pi.on("session_tree", async (_event, ctx) => review.tree(ctx));
  pi.on("session_shutdown", () => review.shutdown());
}
