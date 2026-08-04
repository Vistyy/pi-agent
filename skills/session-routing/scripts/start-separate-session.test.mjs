import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("./start-separate-session.mjs", import.meta.url);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "session-routing-test-"));
  const bin = path.join(root, "bin");
  const log = path.join(root, "herdr-args.jsonl");
  const handoff = path.join(root, "handoff.md");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(bin));
  await writeFile(handoff, "Own the documentation audit.\n");
  await writeFile(
    path.join(bin, "herdr"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$HERDR_TEST_LOG"
if [ "$1 $2" = "workspace create" ]; then
  printf '%s\\n' '{"id":"cli:workspace:create","result":{"root_pane":{"pane_id":"w99:p1"},"tab":{"tab_id":"w99:t1"},"workspace":{"workspace_id":"w99","label":"docs-audit"},"type":"workspace_created"}}'
  exit 0
fi
if [ "$1 $2" = "agent start" ]; then
  if [ "\${HERDR_TEST_NOT_READY_ONCE:-}" = "1" ] && [ ! -e "$HERDR_TEST_READY_FILE" ]; then
    touch "$HERDR_TEST_READY_FILE"
    printf '%s\\n' '{"error":{"code":"pane_not_ready","message":"agent target pane w99:p1 is not an available shell"}}'
    exit 1
  fi
  if [ "\${HERDR_TEST_AGENT_START_ERROR:-}" = "1" ]; then
    printf '%s\\n' '{"error":{"code":"agent_start_failed","message":"agent launch rejected"}}'
    exit 1
  fi
  printf '%s\\n' '{"id":"cli:agent:start","result":{"agent":{"name":"docs-audit","terminal_id":"term_123","cwd":"${root}","agent_status":"unknown","workspace_id":"w99"},"type":"agent_started"}}'
  exit 0
fi
if [ "$1 $2" = "workspace focus" ]; then
  printf '%s\\n' '{"id":"cli:workspace:focus","result":{"type":"ok"}}'
  exit 0
fi
if [ "$1 $2" = "pane send-text" ] || [ "$1 $2" = "pane send-keys" ]; then
  printf '%s\\n' '{"id":"cli:pane:input","result":{"type":"ok"}}'
  exit 0
fi
if [ "$1 $2" = "agent get" ]; then
  printf '%s\\n' '{"id":"cli:agent:get","result":{"agent":{"agent":"pi","agent_session":{"value":"${root}/session.jsonl"},"agent_status":"working","name":"docs-audit","terminal_id":"term_123","cwd":"${root}","workspace_id":"w99"},"type":"agent_info"}}'
  exit 0
fi
printf '%s\\n' '{"error":{"code":"unexpected","message":"unexpected command"}}'
exit 1
`,
  );
  await chmod(path.join(bin, "herdr"), 0o755);
  return {
    root,
    handoff,
    log,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HERDR_TEST_LOG: log },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function run(args, env = process.env) {
  return spawnSync(process.execPath, [script.pathname, ...args], {
    encoding: "utf8",
    env,
  });
}

test("no arguments shows a non-mutating home view", () => {
  const result = run([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^bin: /m);
  assert.match(result.stdout, /^description: /m);
  assert.match(result.stdout, /^usage: /m);
});

test("missing required input fails with actionable usage", () => {
  const result = run(["--name", "docs-audit"]);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /^error: --cwd is required$/m);
  assert.match(result.stdout, /^help: /m);
  assert.equal(result.stderr, "");
});

test("rejects a generic session name", async () => {
  const f = await fixture();
  try {
    const result = run(
      ["--name", "session", "--cwd", f.root, "--handoff-file", f.handoff],
      f.env,
    );
    assert.equal(result.status, 2);
    assert.match(
      result.stdout,
      /^error: --name must be a descriptive kebab-case name of at most 32 characters$/m,
    );
    assert.match(result.stdout, /audit-agent-instructions/);
  } finally {
    await f.cleanup();
  }
});

test("rejects a name that Herdr cannot accept", () => {
  const result = run([
    "--name",
    "this-session-name-is-longer-than-32",
    "--cwd",
    "/tmp",
    "--handoff-file",
    "/tmp/handoff.md",
  ]);
  assert.equal(result.status, 2);
  assert.match(
    result.stdout,
    /^error: --name must be a descriptive kebab-case name of at most 32 characters$/m,
  );
});

test("starts default Pi through Herdr and verifies the detected session", async () => {
  const f = await fixture();
  try {
    const result = run(
      ["--name", "docs-audit", "--cwd", f.root, "--handoff-file", f.handoff],
      f.env,
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^session:$/m);
    assert.match(result.stdout, /^  name: "docs-audit"$/m);
    assert.match(result.stdout, /^  terminal_id: "term_123"$/m);
    assert.match(result.stdout, /^  status: "working"$/m);
    assert.match(result.stdout, /^  focus: false$/m);
    assert.match(result.stdout, /^  workspace_id: "w99"$/m);
    assert.match(result.stdout, /^  workspace_label: "docs-audit"$/m);

    const calls = (await readFile(f.log, "utf8")).trim().split("\n");
    assert.equal(calls[0], `workspace create --cwd ${f.root} --label docs-audit --no-focus`);
    assert.equal(
      calls[1],
      "agent start docs-audit --kind pi --pane w99:p1 -- --name docs-audit",
    );
    assert.doesNotMatch(calls[1], /--model|--continue|--resume|--fork/);
    assert.equal(calls[2], `pane send-text w99:p1 @${f.handoff}`);
    assert.equal(calls[3], "pane send-keys w99:p1 Enter");
    assert.equal(calls[4], "agent get docs-audit");
  } finally {
    await f.cleanup();
  }
});

test("waits for a newly created pane to become an interactive shell", async () => {
  const f = await fixture();
  try {
    const result = run(
      ["--name", "docs-audit", "--cwd", f.root, "--handoff-file", f.handoff],
      {
        ...f.env,
        HERDR_TEST_NOT_READY_ONCE: "1",
        HERDR_TEST_READY_FILE: path.join(f.root, "shell-ready"),
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const calls = (await readFile(f.log, "utf8")).trim().split("\n");
    assert.deepEqual(calls.slice(0, 4), [
      `workspace create --cwd ${f.root} --label docs-audit --no-focus`,
      "agent start docs-audit --kind pi --pane w99:p1 -- --name docs-audit",
      "agent start docs-audit --kind pi --pane w99:p1 -- --name docs-audit",
      `pane send-text w99:p1 @${f.handoff}`,
    ]);
  } finally {
    await f.cleanup();
  }
});

test("fails when a pane does not become a shell before the timeout", async () => {
  const f = await fixture();
  try {
    const result = run(
      [
        "--name",
        "docs-audit",
        "--cwd",
        f.root,
        "--handoff-file",
        f.handoff,
        "--timeout-ms",
        "0",
      ],
      {
        ...f.env,
        HERDR_TEST_NOT_READY_ONCE: "1",
        HERDR_TEST_READY_FILE: path.join(f.root, "shell-ready"),
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /agent target pane w99:p1 is not an available shell/);
    const calls = (await readFile(f.log, "utf8")).trim().split("\n");
    assert.equal(
      calls.filter((call) => call.startsWith("agent start docs-audit")).length,
      1,
    );
  } finally {
    await f.cleanup();
  }
});

test("does not retry another agent-start failure", async () => {
  const f = await fixture();
  try {
    const result = run(
      ["--name", "docs-audit", "--cwd", f.root, "--handoff-file", f.handoff],
      { ...f.env, HERDR_TEST_AGENT_START_ERROR: "1" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /agent launch rejected/);
    const calls = (await readFile(f.log, "utf8")).trim().split("\n");
    assert.equal(
      calls.filter((call) => call.startsWith("agent start docs-audit")).length,
      1,
    );
  } finally {
    await f.cleanup();
  }
});

test("focuses a continuation handoff when requested", async () => {
  const f = await fixture();
  try {
    const result = run(
      ["--name", "docs-audit", "--cwd", f.root, "--handoff-file", f.handoff, "--focus"],
      f.env,
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^  focus: true$/m);
    const calls = await readFile(f.log, "utf8");
    assert.match(calls, /workspace create .* --label docs-audit --no-focus/);
    assert.match(calls, /agent start docs-audit --kind pi --pane w99:p1 -- /);
    assert.match(calls, /workspace focus w99/);
  } finally {
    await f.cleanup();
  }
});
