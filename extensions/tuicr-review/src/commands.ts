import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Comment, ExactComparison, FeedbackComment, OwnedReview } from "./types.ts";
import type { NormalizedReview } from "./model.ts";

interface Result { code: number; stdout: string; stderr: string }

export class ReviewCommands {
  private readonly herdr = process.env.HERDR_BIN_PATH ?? "herdr";
  private readonly tuicr = process.env.TUICR_BIN_PATH ?? "tuicr";

  constructor(private readonly pi: Pick<ExtensionAPI, "exec">) {}

  async resolveComparison(cwd: string, base: string, head: string, signal?: AbortSignal): Promise<ExactComparison> {
    return {
      base: await this.resolveCommit(cwd, base, "base", signal),
      head: await this.resolveCommit(cwd, head, "head", signal),
    };
  }

  async launch(request: NormalizedReview, ownerSessionId: string, signal?: AbortSignal): Promise<OwnedReview> {
    if (process.env.HERDR_ENV !== "1") throw new Error("tuicr_review requires Pi to run inside Herdr.");
    const dataHome = await mkdtemp(join(tmpdir(), `pi-tuicr-review-${ownerSessionId}-`));
    const completionFile = join(dataHome, "exit");
    let tabId: string | undefined;
    try {
      const current = resultObject(await this.pi.exec(this.herdr, ["pane", "current", "--current"], { signal, timeout: 5_000 }), "read current Herdr pane");
      const pane = object(current.pane, "current pane");
      const workspaceId = string(pane.workspace_id, "workspace id");
      const created = resultObject(await this.pi.exec(this.herdr, [
        "tab", "create", "--workspace", workspaceId, "--cwd", request.cwd, "--label", "Tuicr review",
        "--env", `XDG_DATA_HOME=${dataHome}`, "--no-focus",
      ], { signal, timeout: 10_000 }), "create Herdr review tab");
      tabId = string(object(created.tab, "created tab").tab_id, "tab id");
      const paneId = string(object(created.root_pane, "created pane").pane_id, "pane id");
      const script = [
        "cd", quote(request.cwd), "&&", quote(this.tuicr), ...request.launchArgs.map(quote),
        ";", "code=$?", ";", "printf", quote("%s\\n"), '"$code"', ">", quote(completionFile),
      ].join(" ");
      checked(await this.pi.exec(this.herdr, ["pane", "run", paneId, `sh -lc ${quote(script)}`], { signal, timeout: 10_000 }), "launch Tuicr");
      const sessionId = await this.waitForSession(request.cwd, dataHome, signal);
      return {
        targetKey: request.targetKey, cwd: request.cwd, base: request.base, head: request.head,
        tabId, paneId, sessionId, dataHome, completionFile, accepted: {}, reported: [],
      };
    } catch (error) {
      const warnings = await this.cleanupPaths(tabId, dataHome);
      if (warnings.length) throw new Error(`${message(error)} Cleanup also failed: ${warnings.join("; ")}`);
      throw error;
    }
  }

  async comments(review: OwnedReview, signal?: AbortSignal): Promise<Comment[]> {
    const result = await this.tuicrCommand(review, ["review", "comments", "--session", review.sessionId, "--repo", review.cwd], signal);
    const value = json(result.stdout, "read Tuicr comments");
    if (!Array.isArray(value)) throw new Error("Tuicr comments response was not an array.");
    return value.map((item) => {
      if (!isObject(item) || typeof item.id !== "string" || typeof item.content !== "string") throw new Error("Tuicr returned an invalid comment.");
      return item as unknown as Comment;
    });
  }

  async sessionExists(review: OwnedReview, signal?: AbortSignal): Promise<boolean> {
    const result = await this.pi.exec("env", [
      `XDG_DATA_HOME=${review.dataHome}`, this.tuicr, "review", "list", "--repo", review.cwd,
    ], { signal, timeout: 10_000 });
    const value = json(checked(result, "list Tuicr sessions").stdout, "list Tuicr sessions");
    if (!Array.isArray(value)) throw new Error("Tuicr session list response was not an array.");
    return value.some((item) => isObject(item) && item.slug === review.sessionId);
  }

  async groundComment(review: OwnedReview, comment: Comment): Promise<FeedbackComment> {
    const path = comment.path?.trim();
    const start = comment.start_line;
    const end = comment.end_line ?? start;
    if (start == null) return comment;
    const side = comment.side ?? "new";
    const revision = side === "old" ? review.base : review.head;
    const grounding = { revision, side, path: path || "(missing path)", startLine: start, endLine: end ?? start };
    if (!path) return { ...comment, grounding: { ...grounding, unresolved: "Tuicr returned a line comment without a path." } };
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end! < start) {
      return { ...comment, grounding: { ...grounding, unresolved: "Tuicr returned an invalid line range." } };
    }
    const result = await this.pi.exec("git", ["-C", review.cwd, "show", `${revision}:${path}`], { timeout: 10_000 });
    if (result.code !== 0) {
      return { ...comment, grounding: { ...grounding, unresolved: `Git could not read ${revision}:${path}: ${oneLine(result.stderr || result.stdout)}` } };
    }
    const lines = result.stdout.replace(/\n$/, "").split("\n");
    if (start > lines.length || end! > lines.length) {
      return { ...comment, grounding: { ...grounding, unresolved: `Range ${start}-${end} is outside the ${lines.length}-line file at ${revision}.` } };
    }
    const first = Math.max(1, start - 2);
    const citedLast = Math.min(end!, start + 16);
    const last = Math.min(lines.length, citedLast + 2);
    const excerpt = lines.slice(first - 1, last).map((line, index) => {
      const number = first + index;
      return `${number >= start && number <= citedLast ? ">>" : "  "} ${number}: ${line}`;
    }).join("\n");
    return { ...comment, grounding: { ...grounding, excerpt: `${excerpt}${end! > citedLast ? `\n>> … cited range continues through line ${end}` : ""}` } };
  }

  async add(review: OwnedReview, payload: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    const result = await this.tuicrCommand(review, [
      "review", "add", "--session", review.sessionId, "--repo", review.cwd, "--input", JSON.stringify(payload),
    ], signal);
    const value = json(result.stdout, "add Tuicr annotation");
    if (!isObject(value) || typeof value.id !== "string") throw new Error("Tuicr annotation response omitted its comment ID.");
    return value.id;
  }

  async completion(review: OwnedReview): Promise<number | undefined> {
    try {
      const value = (await readFile(review.completionFile, "utf8")).trim();
      if (!/^-?\d+$/.test(value)) throw new Error("Tuicr wrote an invalid exit marker.");
      return Number(value);
    } catch (error) {
      if (isObject(error) && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  async tabExists(review: OwnedReview): Promise<boolean> {
    const result = await this.pi.exec(this.herdr, ["tab", "get", review.tabId], { timeout: 5_000 });
    if (result.code === 0) return true;
    if (/not[_ -]?found|does not exist|unknown tab/i.test(result.stderr || result.stdout)) return false;
    throw new Error(`inspect owned Herdr tab failed: ${oneLine(result.stderr || result.stdout)}`);
  }

  async dataExists(review: OwnedReview): Promise<boolean> {
    try {
      await access(review.dataHome);
      return true;
    } catch (error) {
      if (isObject(error) && error.code === "ENOENT") return false;
      throw error;
    }
  }

  async cleanup(review: OwnedReview): Promise<{ warnings: string[]; tabClosed: boolean }> {
    try {
      if (await this.tabExists(review)) {
        checked(await this.pi.exec(this.herdr, ["tab", "close", review.tabId], { timeout: 10_000 }), `close owned tab ${review.tabId}`);
      }
    } catch (error) {
      return { warnings: [message(error)], tabClosed: false };
    }
    try {
      await rm(review.dataHome, { recursive: true, force: true });
      return { warnings: [], tabClosed: true };
    } catch (error) {
      return { warnings: [`remove ${review.dataHome}: ${message(error)}`], tabClosed: true };
    }
  }

  sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      timer.unref?.();
    });
  }

  private async resolveCommit(cwd: string, revision: string, label: string, signal?: AbortSignal): Promise<string> {
    const result = await this.pi.exec("git", ["-C", cwd, "rev-parse", "--verify", `${revision}^{commit}`], { signal, timeout: 10_000 });
    const commit = checked(result, `resolve ${label} revision`).stdout.trim();
    if (!/^[0-9a-f]{40,64}$/i.test(commit)) throw new Error(`Git returned an invalid ${label} commit ID.`);
    return commit;
  }

  private async waitForSession(cwd: string, dataHome: string, signal?: AbortSignal): Promise<string> {
    let last = "Tuicr review session is not ready.";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await this.pi.exec("env", [`XDG_DATA_HOME=${dataHome}`, this.tuicr, "review", "list", "--repo", cwd], { signal, timeout: 10_000 });
      if (result.code === 0) {
        const value = json(result.stdout, "list Tuicr sessions");
        if (Array.isArray(value)) {
          const active = value.filter((item) => isObject(item) && item.active === true && typeof item.slug === "string");
          if (active.length === 1) return (active[0] as { slug: string }).slug;
          last = `Expected one active session in the private Tuicr data directory, found ${active.length}.`;
        }
      } else last = `list Tuicr sessions failed: ${oneLine(result.stderr || result.stdout)}`;
      await this.sleep(250);
    }
    throw new Error(last);
  }

  private tuicrCommand(review: OwnedReview, args: string[], signal?: AbortSignal): Promise<Result> {
    return this.pi.exec("env", [`XDG_DATA_HOME=${review.dataHome}`, this.tuicr, ...args], { signal, timeout: 10_000 }).then((result) => checked(result, args.slice(0, 2).join(" ")));
  }

  private async cleanupPaths(tabId: string | undefined, dataHome: string): Promise<string[]> {
    const warnings: string[] = [];
    if (tabId) {
      try { checked(await this.pi.exec(this.herdr, ["tab", "close", tabId], { timeout: 10_000 }), `close owned tab ${tabId}`); }
      catch (error) { return [message(error)]; }
    }
    try { await rm(dataHome, { recursive: true, force: true }); }
    catch (error) { warnings.push(`remove ${dataHome}: ${message(error)}`); }
    return warnings;
  }
}

function checked<T extends Result>(result: T, operation: string): T {
  if (result.code !== 0) throw new Error(`${operation} failed: ${oneLine(result.stderr || result.stdout)}`);
  return result;
}
function resultObject(result: Result, operation: string): Record<string, unknown> {
  const envelope = json(checked({ ...result, stdout: result.stdout || result.stderr }, operation).stdout, operation);
  if (!isObject(envelope)) throw new Error(`${operation} returned a non-object.`);
  if (envelope.error) throw new Error(`${operation} failed: ${JSON.stringify(envelope.error)}`);
  return object(envelope.result, "Herdr result");
}
function json(value: string, operation: string): unknown {
  try { return JSON.parse(value); }
  catch (cause) { throw new Error(`${operation} returned invalid JSON.`, { cause }); }
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`Response omitted ${label}.`);
  return value;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Response omitted ${label}.`);
  return value;
}
function isObject(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function quote(value: string): string { return `'${value.replaceAll("'", `'"'"'`)}'`; }
function oneLine(value: string): string { return value.replace(/\s+/g, " ").trim().slice(0, 500); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
