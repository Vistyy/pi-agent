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
    exposure: "deferred",
    namespace: {
      name: "code-review",
      description: "Open and annotate committed diffs in Tuicr.",
    },
    description: "Open or reuse a Tuicr review of committed base/head revisions in a Herdr tab. Inspect the diff, then guide a Maintainer who has not read the code through what changed, why, and what deserves attention. Explain important decisions and trade-offs with concrete examples. Surface uncertainty and questionable choices, and ask focused questions where the Maintainer's judgment is needed. Choose the narrowest useful annotation scope, avoid repetition, and use small visuals when helpful. Do not present the change as unquestionably complete. Ground responses to feedback in the attached exact source; assess suggestions rather than accepting them automatically, and clarify unresolvable references.",
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
