import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "vitest";
import { ReviewCommands } from "../src/commands.ts";
import { normalizeReview } from "../src/model.ts";

test("creates one unfocused private Herdr tab and launches Tuicr to readiness", async () => {
  const previous = process.env.HERDR_ENV;
  process.env.HERDR_ENV = "1";
  const calls: Array<{ command: string; args: string[] }> = [];
  try {
    const commands = new ReviewCommands({
      async exec(command: string, args: string[]) {
        calls.push({ command, args });
        if (args[0] === "pane" && args[1] === "current") {
          return { code: 0, stdout: JSON.stringify({ result: { pane: { workspace_id: "workspace" } } }), stderr: "" };
        }
        if (args[0] === "tab" && args[1] === "create") {
          return { code: 0, stdout: JSON.stringify({ result: {
            tab: { tab_id: "workspace:tab" }, root_pane: { pane_id: "workspace:pane" },
          } }), stderr: "" };
        }
        if (args[0] === "pane" && args[1] === "run") return { code: 0, stdout: "", stderr: "" };
        if (command === "env") return { code: 0, stdout: JSON.stringify([{ slug: "exact", active: true }]), stderr: "" };
        if (args[0] === "tab" && args[1] === "get") return { code: 1, stdout: "", stderr: "unknown tab" };
        if (args[0] === "tab" && args[1] === "close") return { code: 0, stdout: JSON.stringify({ result: {} }), stderr: "" };
        throw new Error(`unexpected command ${command} ${args.join(" ")}`);
      },
    } as any);
    const review = await commands.launch(normalizeReview("/repo", { target: { kind: "workingTree" } }), "pi-session");
    assert.equal(review.sessionId, "exact");
    assert.deepEqual({ tabId: review.tabId, paneId: review.paneId }, { tabId: "workspace:tab", paneId: "workspace:pane" });
    const create = calls.find((call) => call.args[0] === "tab" && call.args[1] === "create")!;
    assert.ok(create.args.includes("--no-focus"));
    assert.ok(create.args.includes(`XDG_DATA_HOME=${review.dataHome}`));
    const run = calls.find((call) => call.args[0] === "pane" && call.args[1] === "run")!;
    assert.equal(run.args[2], review.paneId);
    assert.match(run.args[3]!, /--working-tree/);
    assert.match(run.args[3]!, /--stdout/);
    assert.match(run.args[3]!, /--no-update-check/);
    assert.equal(calls.some((call) => call.command === "git" || call.args[0] === "--version"), false);
    assert.deepEqual(await commands.cleanup(review), []);
    assert.equal(calls.some((call) => call.args[0] === "tab" && call.args[1] === "close"), false);
  } finally {
    if (previous === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = previous;
  }
});

const execFileAsync = promisify(execFile);

test("launch quoting and exit marker survive a fish outer shell", async () => {
  const root = await mkdtemp(join(tmpdir(), "tuicr shell 'quotes' "));
  const repo = join(root, "repo 'with spaces'");
  const herdr = join(root, "fake herdr");
  const tuicr = join(root, "fake tuicr");
  const capture = join(root, "capture");
  await writeFile(herdr, `#!/bin/sh\ncase "$1 $2" in\n  "pane current") echo '{"result":{"pane":{"workspace_id":"workspace"}}}' ;;\n  "tab create") echo '{"result":{"tab":{"tab_id":"tab"},"root_pane":{"pane_id":"pane"}}}' ;;\n  "pane run") sh -c "$4" ;;\n  "tab get") exit 1 ;;\n  *) exit 2 ;;\nesac\n`);
  await writeFile(tuicr, `#!/bin/sh\nif [ "$1 $2" = "review list" ]; then\n  echo '[{"slug":"exact","active":true}]'\n  exit 0\nfi\nprintf '%s\\n' "$PWD" "$@" > "$TEST_CAPTURE"\nexit 7\n`);
  await chmod(herdr, 0o755);
  await chmod(tuicr, 0o755);
  await mkdir(repo);

  const previous = {
    herdr: process.env.HERDR_BIN_PATH, tuicr: process.env.TUICR_BIN_PATH,
    env: process.env.HERDR_ENV, capture: process.env.TEST_CAPTURE,
  };
  Object.assign(process.env, { HERDR_BIN_PATH: herdr, TUICR_BIN_PATH: tuicr, HERDR_ENV: "1", TEST_CAPTURE: capture });
  try {
    const commands = new ReviewCommands({
      async exec(command: string, args: string[], options?: { timeout?: number }) {
        try {
          const result = await execFileAsync("fish", ["-c", "command $argv", command, ...args], { timeout: options?.timeout });
          return { code: 0, stdout: result.stdout, stderr: result.stderr };
        } catch (error: any) {
          return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
        }
      },
    } as any);
    const review = await commands.launch(normalizeReview(repo, { target: { kind: "workingTree" } }), "pi-session");
    assert.equal(await commands.completion(review), 7);
    assert.deepEqual((await readFile(capture, "utf8")).trim().split("\n"), [repo, "--working-tree", "--stdout", "--no-update-check"]);
    await commands.cleanup(review);
  } finally {
    const names = { herdr: "HERDR_BIN_PATH", tuicr: "TUICR_BIN_PATH", env: "HERDR_ENV", capture: "TEST_CAPTURE" } as const;
    for (const key of Object.keys(previous) as Array<keyof typeof previous>) {
      const value = previous[key];
      if (value === undefined) delete process.env[names[key]]; else process.env[names[key]] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});
