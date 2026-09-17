import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import extension, { TuicrReviewParameters, commandBackend } from "./index.ts";

test("registers exactly one agent-facing tool and no command or shortcut", () => {
  const tools: any[] = [];
  let commands = 0;
  let shortcuts = 0;
  const handlers: Record<string, Function> = {};
  extension({
    registerTool(tool: unknown) { tools.push(tool); },
    registerCommand() { commands += 1; },
    registerShortcut() { shortcuts += 1; },
    on(name: string, handler: Function) { handlers[name] = handler; },
    exec: async () => ({ code: 1, stdout: "", stderr: "not called" }),
    appendEntry() {},
    sendMessage() {},
  } as any);
  assert.deepEqual(tools.map((tool) => tool.name), ["tuicr_review"]);
  assert.ok(tools[0].promptGuidelines.some((guideline: string) => guideline.includes("designated local Maintainer-inspection capability")));
  assert.ok(tools[0].promptGuidelines.some((guideline: string) => guideline.includes("Human sign-off as Required")));
  assert.ok(tools[0].promptGuidelines.some((guideline: string) => guideline.includes("non-authoritative")));
  assert.equal(commands, 0);
  assert.equal(shortcuts, 0);
  assert.deepEqual(Object.keys(handlers).sort(), ["session_shutdown", "session_start", "session_tree"]);
});

test("public schema is strict at every object boundary", () => {
  assert.equal((TuicrReviewParameters as any).additionalProperties, false);
  const targetVariants = (TuicrReviewParameters.properties.target as any).anyOf;
  assert.ok(targetVariants.every((variant: any) => variant.additionalProperties === false));
  const annotationVariants = (TuicrReviewParameters.properties.annotations as any).items.anyOf;
  assert.ok(annotationVariants.every((variant: any) => variant.additionalProperties === false));
  const range = annotationVariants.find((variant: any) => variant.properties.startLine);
  assert.ok(range.properties.type, "comment taxonomy must remain optional, not absent or mandatory");
  assert.ok(!range.required.includes("type"));
});

test("uses the live current pane workspace and ignores stale inherited identity", async () => {
  const previous = {
    HERDR_ENV: process.env.HERDR_ENV,
    HERDR_WORKSPACE_ID: process.env.HERDR_WORKSPACE_ID,
    HERDR_PANE_ID: process.env.HERDR_PANE_ID,
    HERDR_BIN_PATH: process.env.HERDR_BIN_PATH,
    TUICR_BIN_PATH: process.env.TUICR_BIN_PATH,
  };
  process.env.HERDR_ENV = "1";
  process.env.HERDR_WORKSPACE_ID = "stale-workspace";
  process.env.HERDR_PANE_ID = "stale-pane";
  process.env.HERDR_BIN_PATH = "herdr";
  process.env.TUICR_BIN_PATH = "tuicr";
  const calls: Array<{ command: string; args: string[] }> = [];
  try {
    const backend = commandBackend({
      async exec(command: string, args: string[]) {
        calls.push({ command, args });
        if (command === "herdr" && args[0] === "pane") {
          return { code: 0, stdout: JSON.stringify({ result: { pane: { pane_id: "live:p1", workspace_id: "live-workspace" } } }), stderr: "" };
        }
        if (command === "tuicr" && args[0] === "--version") {
          return { code: 0, stdout: "tuicr 0.26.0", stderr: "" };
        }
        if (command === "git") return { code: 0, stdout: "/repo", stderr: "" };
        if (command === "herdr" && args[0] === "tab") {
          return {
            code: 0,
            stdout: JSON.stringify({ result: {
              workspace_id: "live-workspace",
              tab: { tab_id: "live:t1", workspace_id: "live-workspace" },
              root_pane: { pane_id: "live:p2" },
            } }),
            stderr: "",
          };
        }
        throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
      },
    } as any);
    const preflight = await backend.preflight("/repo");
    await backend.createTab("/repo", preflight.workspaceId, "/tmp/private-tuicr-data");
    assert.deepEqual(calls[0], { command: "herdr", args: ["pane", "current", "--current"] });
    const create = calls.find((call) => call.command === "herdr" && call.args[0] === "tab")!;
    assert.deepEqual(create.args.slice(0, 5), ["tab", "create", "--workspace", "live-workspace", "--cwd"]);
    assert.ok(create.args.includes("XDG_DATA_HOME=/tmp/private-tuicr-data"));
    assert.ok(!create.args.some((arg) => arg.startsWith("XDG_CONFIG_HOME=")));
    assert.ok(!create.args.includes("stale-workspace"));
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("runs every review CLI operation in the exact private XDG data directory", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const backend = commandBackend({
    async exec(command: string, args: string[]) {
      calls.push({ command, args });
      const operation = args.includes("list") ? "list" : args.includes("comments") ? "comments" : "add";
      return { code: 0, stdout: operation === "add" ? JSON.stringify({ id: "c1", content: "x" }) : "[]", stderr: "" };
    },
  } as any);
  const owned = "/tmp/private-tuicr-data";
  const exact = { slug: "s", path: "/tmp/private-tuicr-data/tuicr/s.json" };
  await backend.listSessions("/repo", owned);
  await backend.comments("/repo", owned, exact);
  await backend.add("/repo", owned, exact, { content: "x" });
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.command, "env");
    assert.deepEqual(call.args.slice(0, 2), [`XDG_DATA_HOME=${owned}`, "tuicr"]);
    assert.ok(!call.args.some((arg) => arg.startsWith("XDG_CONFIG_HOME=")));
  }
});

test("launch accepts Herdr pane run empty success and reports bounded nonzero output", async () => {
  const results = [
    { code: 0, stdout: "", stderr: "" },
    { code: 23, stdout: "", stderr: ` pane unavailable ${"x".repeat(600)} ` },
  ];
  const backend = commandBackend({
    async exec() { return results.shift()!; },
  } as any);

  await backend.launch(
    { workspaceId: "w1", tabId: "w1:t1", paneId: "w1:p1" },
    "/repo",
    ["--working-tree", "--stdout"],
    "/tmp/tuicr.exit",
  );
  await assert.rejects(
    backend.launch(
      { workspaceId: "w1", tabId: "w1:t1", paneId: "w1:p1" },
      "/repo",
      ["--working-tree", "--stdout"],
      "/tmp/tuicr.exit",
    ),
    (error: Error) => {
      assert.match(error.message, /^launch Tuicr failed \(Herdr pane run exited 23\): pane unavailable/);
      assert.ok(error.message.length <= 570, "launch diagnostic must remain bounded");
      return true;
    },
  );
});

test("launch is shell-independent and records the exact Tuicr exit code under fish", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tuicr-review-shell-"));
  const cwd = join(directory, "review 'cwd");
  const tuicr = join(directory, "fake tuicr 'bin");
  const observed = join(directory, "observed arguments");
  const completion = join(directory, "completion 'exact'.txt");
  const previousTuicr = process.env.TUICR_BIN_PATH;
  const quote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
  try {
    await mkdir(cwd);
    await writeFile(tuicr, [
      "#!/bin/sh",
      `printf '%s\\n' \"$PWD\" > ${quote(observed)}`,
      `printf '<%s>\\n' \"$@\" >> ${quote(observed)}`,
      "exit 37",
      "",
    ].join("\n"));
    await chmod(tuicr, 0o700);
    process.env.TUICR_BIN_PATH = tuicr;

    let outerCommand = "";
    const backend = commandBackend({
      async exec(command: string, args: string[]) {
        assert.match(command, /(?:^|\/)herdr$/);
        assert.deepEqual(args.slice(0, 3), ["pane", "run", "w1:p1"]);
        outerCommand = args[3]!;
        const result = await promisify(execFile)("fish", ["-c", outerCommand]);
        return { code: 0, stdout: result.stdout, stderr: result.stderr };
      },
    } as any);
    const launchArgs = ["--stdout", "argument with spaces", "quote'argument", "$literal;still-one-arg"];
    await backend.launch(
      { workspaceId: "w1", tabId: "w1:t1", paneId: "w1:p1" },
      cwd,
      launchArgs,
      completion,
    );

    assert.match(outerCommand, /^sh -lc /);
    assert.equal(await readFile(completion, "utf8"), "37\n");
    assert.deepEqual(
      (await readFile(observed, "utf8")).trimEnd().split("\n"),
      [cwd, ...launchArgs.map((argument) => `<${argument}>`)],
    );
  } finally {
    if (previousTuicr === undefined) delete process.env.TUICR_BIN_PATH;
    else process.env.TUICR_BIN_PATH = previousTuicr;
    await rm(directory, { recursive: true, force: true });
  }
});

test("Workgraph Worker visibility disables tuicr_review", async () => {
  const settings = JSON.parse(await readFile(new URL("../../settings.json", import.meta.url), "utf8"));
  const disabled = settings["pi-workgraph"].worker.disabledTools;
  assert.ok(disabled.includes("tuicr_review"));
  assert.equal(disabled.filter((name: string) => name === "tuicr_review").length, 1);
});
