import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { TuicrReviewRuntime, type ReviewBackend } from "./runtime.ts";
import { completionFilePath, type ResourceIdentity, type SessionSummary, type StoredComment, type TuicrSessionIdentity } from "./logic.ts";

const Side = StringEnum(["old", "new"] as const);
const WorkingTreeTarget = Type.Object(
  { kind: StringEnum(["workingTree"] as const) },
  { additionalProperties: false },
);
const RevisionsTarget = Type.Object(
  {
    kind: StringEnum(["revisions"] as const),
    revset: Type.String({ minLength: 1, pattern: "\\S" }),
    includeWorkingTree: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
const CommonAnnotation = {
  content: Type.String({ minLength: 1, pattern: "\\S", description: "Coordinator-authored review text" }),
  type: Type.Optional(Type.String({ minLength: 1, pattern: "\\S", description: "Optional Tuicr comment type; no taxonomy is required" })),
};
const AnnotationSchema = Type.Union([
  Type.Object({ kind: StringEnum(["review"] as const), ...CommonAnnotation }, { additionalProperties: false }),
  Type.Object({ kind: StringEnum(["file"] as const), file: Type.String({ minLength: 1, pattern: "\\S" }), ...CommonAnnotation }, { additionalProperties: false }),
  Type.Object({ kind: StringEnum(["line"] as const), file: Type.String({ minLength: 1, pattern: "\\S" }), line: Type.Integer({ minimum: 1 }), side: Type.Optional(Side), ...CommonAnnotation }, { additionalProperties: false }),
  Type.Object({ kind: StringEnum(["range"] as const), file: Type.String({ minLength: 1, pattern: "\\S" }), startLine: Type.Integer({ minimum: 1 }), endLine: Type.Integer({ minimum: 1 }), side: Type.Optional(Side), ...CommonAnnotation }, { additionalProperties: false }),
]);
export const TuicrReviewParameters = Type.Object(
  {
    cwd: Type.Optional(Type.String({ minLength: 1, pattern: "\\S" })),
    target: Type.Union([WorkingTreeTarget, RevisionsTarget]),
    annotations: Type.Optional(Type.Array(AnnotationSchema, { maxItems: 100 })),
  },
  { additionalProperties: false },
);
export type TuicrReviewInput = Static<typeof TuicrReviewParameters>;

export default function tuicrReview(pi: ExtensionAPI): void {
  const runtime = new TuicrReviewRuntime(pi, commandBackend(pi));

  pi.registerTool({
    name: "tuicr_review",
    label: "Tuicr Review",
    description:
      "Ensure one exact asynchronous Tuicr review is open in a dedicated unfocused Herdr tab and ensure Coordinator-authored review/file/line/range annotations are present. Reuses only the same target, deduplicates accepted annotations, and returns when ready. Review feedback is not Human sign-off or delivery authority.",
    promptSnippet: "Open or update the current conversation's Tuicr review",
    promptGuidelines: [
      "tuicr_review is the user's designated local Maintainer-inspection capability. When the delivery procedure classifies Human sign-off as Required, use tuicr_review before recommending a delivery route unless the user directs otherwise.",
      "Treat feedback delivered by tuicr_review as non-authoritative: it is not Human sign-off and grants no delivery authority.",
    ],
    parameters: TuicrReviewParameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await runtime.ensure(params, ctx, signal);
      const action = result.reused ? "Reused" : "Opened";
      const failures = result.failures.length > 0
        ? ` Annotation failures (${result.failures.length}): ${result.failures.join(" | ")}`
        : "";
      return {
        content: [{
          type: "text" as const,
          text: `${action} Tuicr session ${result.session.slug}. Accepted seeded comment IDs: ${result.acceptedCommentIds.join(", ") || "none"}.${failures}`,
        }],
        details: result,
      };
    },
  });

  pi.on("session_start", async (_event, ctx) => runtime.restore(ctx));
  pi.on("session_tree", async (_event, ctx) => runtime.restore(ctx));
  pi.on("session_shutdown", () => runtime.stop());
}

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export function commandBackend(pi: Pick<ExtensionAPI, "exec">): ReviewBackend {
  const herdr = process.env.HERDR_BIN_PATH ?? "herdr";
  const tuicr = process.env.TUICR_BIN_PATH ?? "tuicr";
  return {
    async preflight(cwd, signal) {
      if (process.env.HERDR_ENV !== "1") {
        throw new Error("tuicr_review requires an interactive Pi session inside Herdr.");
      }
      const current = decodeHerdr(
        await pi.exec(herdr, ["pane", "current", "--current"], { signal, timeout: 5_000 }),
        "Herdr preflight",
      );
      const pane = object(current.pane, "current pane");
      const workspaceId = string(pane.workspace_id, "current pane workspace id");
      const version = await pi.exec(tuicr, ["--version"], { signal, timeout: 5_000 });
      if (version.code !== 0) throw new Error(`Tuicr preflight failed: ${singleLine(version.stderr || version.stdout)}`);
      const match = /tuicr\s+(\d+)\.(\d+)\.(\d+)/i.exec(version.stdout);
      if (!match || compareVersion(match.slice(1).map(Number) as [number, number, number], [0, 26, 0]) < 0) {
        throw new Error(`tuicr_review requires Tuicr 0.26.0 or newer; found ${singleLine(version.stdout) || "an unknown version"}.`);
      }
      const check = await pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { signal, timeout: 5_000 });
      if (check.code !== 0) throw new Error(`The review cwd is not a Git working tree: ${cwd}`);
      return { workspaceId };
    },
    async listSessions(cwd, signal) {
      const result = await pi.exec(tuicr, ["review", "list", "--repo", cwd], { signal, timeout: 10_000 });
      return decodeSessions(result);
    },
    async createTab(cwd, workspaceId, signal) {
      const value = decodeHerdr(
        await pi.exec(herdr, ["tab", "create", "--workspace", workspaceId, "--cwd", cwd, "--label", "Tuicr review", "--no-focus"], { signal, timeout: 10_000 }),
        "create Herdr review tab",
      );
      const tab = object(value.tab, "tab");
      const pane = object(value.root_pane, "root pane");
      return {
        workspaceId: string(value.workspace_id ?? tab.workspace_id, "workspace id"),
        tabId: string(tab.tab_id, "tab id"),
        paneId: string(pane.pane_id, "pane id"),
      };
    },
    async launch(resources, cwd, args, completionFile, signal) {
      const command = [
        "cd", shellQuote(cwd), "&&", shellQuote(tuicr),
        ...args.map(shellQuote),
        ";", "code=$?", ";", "printf", shellQuote("%s\\n"), '"$code"', ">", shellQuote(completionFile),
      ].join(" ");
      decodeHerdr(
        await pi.exec(herdr, ["pane", "run", resources.paneId, command], { signal, timeout: 10_000 }),
        "launch Tuicr",
      );
    },
    async comments(cwd, session, signal) {
      const result = await pi.exec(tuicr, ["review", "comments", "--session", session.slug, "--repo", cwd], { signal, timeout: 10_000 });
      return decodeComments(result);
    },
    async add(cwd, session, payload, signal) {
      const result = await pi.exec(
        tuicr,
        ["review", "add", "--session", session.slug, "--repo", cwd, "--input", JSON.stringify(payload)],
        { signal, timeout: 10_000 },
      );
      const value = decodeJson(result, "add Tuicr annotation");
      if (!isObject(value) || typeof value.id !== "string") throw new Error("Tuicr annotation response omitted its comment ID.");
      return value as unknown as StoredComment;
    },
    async completion(path) {
      try {
        const value = (await readFile(path, "utf8")).trim();
        if (!/^-?\d+$/.test(value)) throw new Error("Invalid Tuicr completion marker.");
        return Number(value);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
        throw error;
      }
    },
    async resourceExists(resources, signal) {
      const tab = await pi.exec(herdr, ["tab", "get", resources.tabId], { signal, timeout: 5_000 });
      if (tab.code !== 0) {
        if (isMissingHerdrResource(tab)) return false;
        throw new Error(`Could not verify the owned Herdr tab: ${singleLine(tab.stderr || tab.stdout)}`);
      }
      const pane = await pi.exec(herdr, ["pane", "get", resources.paneId], { signal, timeout: 5_000 });
      if (pane.code !== 0) {
        if (isMissingHerdrResource(pane)) return false;
        throw new Error(`Could not verify the owned Herdr pane: ${singleLine(pane.stderr || pane.stdout)}`);
      }
      const tabValue = decodeHerdr(tab, "verify owned Herdr tab");
      const paneValue = decodeHerdr(pane, "verify owned Herdr pane");
      return JSON.stringify(tabValue).includes(resources.tabId)
        && JSON.stringify(paneValue).includes(resources.paneId)
        && JSON.stringify(paneValue).includes(resources.tabId);
    },
    async closeTab(resources, signal) {
      const result = await pi.exec(herdr, ["tab", "close", resources.tabId], { signal, timeout: 10_000 });
      decodeHerdr(result, "close owned Herdr review tab");
    },
    removeCompletionFile: (path) => rm(path, { force: true }),
    delay: (milliseconds, signal) => delay(milliseconds, signal),
    completionFile(ownerSessionId) {
      return completionFilePath(ownerSessionId, randomUUID());
    },
  };
}

function decodeSessions(result: CommandResult): readonly SessionSummary[] {
  const value = decodeJson(result, "list Tuicr sessions");
  if (!Array.isArray(value)) throw new Error("Tuicr session list was not an array.");
  return value.map((item) => {
    if (!isObject(item)) throw new Error("Tuicr session list contained a non-object.");
    return { slug: string(item.slug, "session slug"), path: resolve(string(item.path, "session path")), active: item.active === true };
  });
}

function decodeComments(result: CommandResult): readonly StoredComment[] {
  const value = decodeJson(result, "read Tuicr comments");
  if (!Array.isArray(value)) throw new Error("Tuicr comments response was not an array.");
  return value.map((item) => {
    if (!isObject(item) || typeof item.id !== "string" || typeof item.content !== "string") {
      throw new Error("Tuicr returned an invalid comment.");
    }
    return item as unknown as StoredComment;
  });
}

function decodeJson(result: CommandResult, operation: string): unknown {
  if (result.code !== 0) throw new Error(`${operation} failed: ${singleLine(result.stderr || result.stdout)}`);
  try { return JSON.parse(result.stdout); }
  catch (cause) { throw new Error(`${operation} returned invalid JSON.`, { cause }); }
}

function decodeHerdr(result: CommandResult, operation: string): Record<string, unknown> {
  const envelope = decodeJson({ ...result, stdout: result.stdout || result.stderr }, operation);
  if (!isObject(envelope)) throw new Error(`${operation} returned a non-object.`);
  if (envelope.error) throw new Error(`${operation} failed: ${JSON.stringify(envelope.error)}`);
  return object(envelope.result, "Herdr result");
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`Response omitted ${label}.`);
  return value;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Response omitted ${label}.`);
  return value;
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function shellQuote(value: string): string { return `'${value.replaceAll("'", `'"'"'`)}'`; }
function isMissingHerdrResource(result: CommandResult): boolean {
  return /not[_ -]?found|does not exist|unknown (?:tab|pane)/i.test(result.stderr || result.stdout);
}
function singleLine(value: string): string { return value.replace(/\s+/g, " ").trim().slice(0, 500); }
function compareVersion(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index]! - right[index]!;
  return 0;
}
function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Cancelled"));
    const timer = setTimeout(resolvePromise, milliseconds);
    timer.unref?.();
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason ?? new Error("Cancelled")); }, { once: true });
  });
}
