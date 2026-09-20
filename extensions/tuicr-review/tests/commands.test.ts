import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "vitest";
import { ReviewCommands } from "../src/commands.ts";
import { exactReview, normalizeRequest } from "../src/model.ts";
import type { OwnedReview } from "../src/types.ts";

const base = "a".repeat(40);
const head = "b".repeat(40);

test("resolves commits and launches Tuicr with only the exact range", async () => {
  const previous = process.env.HERDR_ENV;
  process.env.HERDR_ENV = "1";
  const calls: Array<{ command: string; args: string[] }> = [];
  try {
    const commands = new ReviewCommands({
      async exec(command: string, args: string[]) {
        calls.push({ command, args });
        if (command === "git") return { code: 0, stdout: `${args.at(-1)?.startsWith("main") ? base : head}\n`, stderr: "" };
        if (args[0] === "pane" && args[1] === "current") return { code: 0, stdout: '{"result":{"pane":{"workspace_id":"workspace"}}}', stderr: "" };
        if (args[0] === "tab" && args[1] === "create") return { code: 0, stdout: '{"result":{"tab":{"tab_id":"tab"},"root_pane":{"pane_id":"pane"}}}', stderr: "" };
        if (args[0] === "pane" && args[1] === "run") return { code: 0, stdout: "", stderr: "" };
        if (command === "env") return { code: 0, stdout: '[{"slug":"exact","active":true}]', stderr: "" };
        throw new Error(`unexpected ${command} ${args.join(" ")}`);
      },
    } as any);
    const comparison = await commands.resolveComparison("/repo", "main", "HEAD");
    assert.deepEqual(comparison, { base, head });
    const request = exactReview(normalizeRequest("/repo", { base: "main", head: "HEAD", replaceExisting: false }), comparison);
    const review = await commands.launch(request, "owner");
    assert.deepEqual({ base: review.base, head: review.head }, comparison);
    const run = calls.find((call) => call.args[0] === "pane" && call.args[1] === "run")!;
    assert.match(run.args[3]!, new RegExp(`${base}\\.\\.${head}`));
    assert.doesNotMatch(run.args[3]!, /working-tree/);
  } finally {
    if (previous === undefined) delete process.env.HERDR_ENV; else process.env.HERDR_ENV = previous;
  }
});

test("failed launch preserves private data when its created tab cannot close", async () => {
  const previous = process.env.HERDR_ENV;
  process.env.HERDR_ENV = "1";
  let dataHome: string | undefined;
  try {
    const commands = new ReviewCommands({
      async exec(_command: string, args: string[]) {
        if (args[0] === "pane" && args[1] === "current") return { code: 0, stdout: '{"result":{"pane":{"workspace_id":"workspace"}}}', stderr: "" };
        if (args[0] === "tab" && args[1] === "create") {
          dataHome = args.find((arg) => arg.startsWith("XDG_DATA_HOME="))?.slice("XDG_DATA_HOME=".length);
          return { code: 0, stdout: '{"result":{"tab":{"tab_id":"tab"},"root_pane":{"pane_id":"pane"}}}', stderr: "" };
        }
        if (args[0] === "pane" && args[1] === "run") return { code: 1, stdout: "", stderr: "launch failed" };
        if (args[0] === "tab" && args[1] === "close") return { code: 1, stdout: "", stderr: "close denied" };
        throw new Error(`unexpected ${args.join(" ")}`);
      },
    } as any);
    const request = exactReview(normalizeRequest("/repo", { base, head, replaceExisting: false }), { base, head });
    await assert.rejects(commands.launch(request, "owner"), /launch failed[\s\S]*close denied/);
    assert.ok(dataHome);
    await access(dataHome);
  } finally {
    if (dataHome) await rm(dataHome, { recursive: true, force: true });
    if (previous === undefined) delete process.env.HERDR_ENV; else process.env.HERDR_ENV = previous;
  }
});

const execFileAsync = promisify(execFile);

test("cleanup preserves private data when the owned tab cannot close", async () => {
  const dataHome = await mkdtemp(join(tmpdir(), "pi-tuicr-review-owner-"));
  try {
    const commands = new ReviewCommands({
      async exec(_command: string, args: string[]) {
        if (args[0] === "tab" && args[1] === "get") return { code: 0, stdout: "{}", stderr: "" };
        if (args[0] === "tab" && args[1] === "close") return { code: 1, stdout: "", stderr: "close denied" };
        throw new Error(`unexpected ${args.join(" ")}`);
      },
    } as any);
    const cleanup = await commands.cleanup({ tabId: "tab", dataHome } as OwnedReview);
    assert.equal(cleanup.tabClosed, false);
    assert.match(cleanup.warnings[0] ?? "", /close denied/);
    await access(dataHome);
  } finally {
    await rm(dataHome, { recursive: true, force: true });
  }
});

test("grounds old and new excerpts from a real Git repository", async () => {
  const repo = await mkdtemp(join(tmpdir(), "tuicr-grounding-"));
  const run = async (...args: string[]) => execFileAsync("git", ["-C", repo, ...args]);
  try {
    await run("init", "-q");
    await run("config", "user.email", "test@example.com");
    await run("config", "user.name", "Test");
    await writeFile(join(repo, "example.txt"), "one\nold value\nthree\n");
    await run("add", "example.txt");
    await run("commit", "-qm", "base");
    const baseId = (await run("rev-parse", "HEAD")).stdout.trim();
    await writeFile(join(repo, "example.txt"), "one\nnew value\nthree\n");
    await run("commit", "-qam", "head");
    const headId = (await run("rev-parse", "HEAD")).stdout.trim();
    const commands = new ReviewCommands({
      async exec(command: string, args: string[]) {
        try {
          const result = await execFileAsync(command, args);
          return { code: 0, stdout: result.stdout, stderr: result.stderr };
        } catch (error: any) { return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }; }
      },
    } as any);
    const review = { cwd: repo, base: baseId, head: headId } as any;
    const oldComment = await commands.groundComment(review, { id: "old", content: "why old?", path: "example.txt", start_line: 2, end_line: 2, side: "old" });
    const newComment = await commands.groundComment(review, { id: "new", content: "why new?", path: "example.txt", start_line: 2, end_line: 2 });
    assert.equal(oldComment.grounding?.revision, baseId);
    assert.match(oldComment.grounding?.excerpt ?? "", />> 2: old value/);
    assert.equal(newComment.grounding?.revision, headId);
    assert.match(newComment.grounding?.excerpt ?? "", />> 2: new value/);
    const unresolved = await commands.groundComment(review, { id: "bad", content: "where?", path: "missing.txt", start_line: 1 });
    assert.match(unresolved.grounding?.unresolved ?? "", /Git could not read/);
    assert.equal(unresolved.grounding?.excerpt, undefined);
    const missingPath = await commands.groundComment(review, { id: "no-path", content: "where?", start_line: 1 });
    assert.match(missingPath.grounding?.unresolved ?? "", /without a path/);
    assert.equal(missingPath.grounding?.excerpt, undefined);
  } finally { await rm(repo, { recursive: true, force: true }); }
});
