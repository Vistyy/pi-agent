import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const script = new URL("../scripts/launch-handoff.mjs", import.meta.url);

const run = async ({
  byResult,
  herdrMode = "absent",
  handoff = "Implement the change.\n",
  showResult,
  implementDelay = "0",
  agentIdentityField = "name",
  interruptAfterMs,
}) => {
  const root = await mkdtemp(join(tmpdir(), "handoff-observer-test-"));
  const bin = join(root, "bin");
  const log = join(root, "by.log");
  const worktree = join(root, "worktree");
  await mkdir(bin, { recursive: true });

  const just = `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$TEST_BY_LOG"
if [ "$4" = "change" ] && [ "$5" = "implement" ]; then
  handoff_path="$8"
  printf 'handoff=%s\\n' "$handoff_path" >> "$TEST_BY_LOG"
  printf 'content=' >> "$TEST_BY_LOG"
  tr '\\n' ' ' < "$handoff_path" >> "$TEST_BY_LOG"
  printf '\\n' >> "$TEST_BY_LOG"
  sleep "$TEST_IMPLEMENT_DELAY"
  printf '%s\\n' "$TEST_BY_RESULT"
  case "$TEST_BY_RESULT" in *'"error"'*) exit 1;; esac
fi
if [ "$4" = "change" ] && [ "$5" = "show" ]; then
  printf '%s\\n' "$TEST_SHOW_RESULT"
  exit 0
fi
exit 2
`;
  const herdr = `#!/bin/sh
set -eu
if [ "$1 $2" = "api snapshot" ]; then
  if [ "$TEST_HERDR_MODE" = "late" ] && [ -f "$TEST_LATE_MARKER" ]; then
    printf '{"result":{"snapshot":{"agents":[{"%s":"but-why-change-1","cwd":"%s","pane_id":"pane-1","agent_status":"working"}],"panes":[{"pane_id":"pane-1","cwd":"%s"}],"workspaces":[{"workspace_id":"workspace-1","worktree":{"checkout_path":"%s"}}]}}}\\n' "$TEST_AGENT_FIELD" "$TEST_WORKTREE" "$TEST_WORKTREE" "$TEST_WORKTREE"
  elif [ "$TEST_HERDR_MODE" = "unmatched" ]; then
    printf '{"result":{"snapshot":{"agents":[{"name":"unexpected-agent","cwd":"%s","pane_id":"pane-1","agent_status":"starting","agent_session":{"value":"/tmp/unexpected.jsonl"}}],"panes":[{"pane_id":"pane-1","cwd":"%s"}],"workspaces":[{"workspace_id":"workspace-1","worktree":{"checkout_path":"%s"}}]}}}\\n' "$TEST_WORKTREE" "$TEST_WORKTREE" "$TEST_WORKTREE"
  else
    : > "$TEST_LATE_MARKER"
    printf '{"result":{"snapshot":{"agents":[],"panes":[],"workspaces":[]}}}\\n'
  fi
  exit 0
fi
if [ "$1 $2" = "pane process-info" ]; then
  printf '{"result":{"foreground_processes":[{"name":"fish"}]}}\\n'
  exit 0
fi
if [ "$1 $2" = "pane read" ]; then
  printf 'direnv: loading environment\\n'
  exit 0
fi
exit 1
`;
  await writeFile(join(bin, "just"), just);
  await writeFile(join(bin, "herdr"), herdr);
  await chmod(join(bin, "just"), 0o755);
  await chmod(join(bin, "herdr"), 0o755);

  const child = spawn(
    process.execPath,
    [
      script.pathname,
      "--runner",
      "just",
      "--change-id",
      "change-1",
      "--worktree-path",
      worktree,
    ],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        TEST_BY_LOG: log,
        TEST_BY_RESULT: JSON.stringify(byResult),
        TEST_WORKTREE: worktree,
        TEST_SHOW_RESULT: (
          showResult ??
          JSON.stringify({
            change: {
              id: "change-1",
              state: "open",
              readiness: "ready",
              worktreePath: worktree,
            },
          })
        ).replaceAll("WORKTREE_REPLACED_BY_TEST_ENV", worktree),
        TEST_IMPLEMENT_DELAY: implementDelay,
        TEST_AGENT_FIELD: agentIdentityField,
        TEST_HERDR_MODE: herdrMode,
        TEST_LATE_MARKER: join(root, "late.marker"),
        HANDOFF_OBSERVER_POLL_MS: "20",
        HANDOFF_OBSERVER_LATE_GRACE_MS: "200",
        HANDOFF_OBSERVER_SLOW_MS: "10000",
        HANDOFF_OBSERVER_IMPLEMENT_TIMEOUT_MS: "500",
        HANDOFF_OBSERVER_SHOW_TIMEOUT_MS: "500",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end(handoff);
  const interruptTimer =
    interruptAfterMs === undefined
      ? undefined
      : setTimeout(() => child.kill("SIGTERM"), interruptAfterMs);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const code = await new Promise((resolve) => child.on("close", resolve));
  if (interruptTimer) clearTimeout(interruptTimer);
  const byLog = await readFile(log, "utf8").catch(() => "");
  const output = (() => {
    try {
      return JSON.parse(stdout);
    } catch {
      return undefined;
    }
  })();
  const handoffPath = byLog.match(/handoff=(.+)/)?.[1];
  const handoffExists = handoffPath
    ? await readFile(handoffPath, "utf8").then(
        () => true,
        () => false,
      )
    : undefined;
  const trace = output?.tracePath
    ? await readFile(output.tracePath, "utf8").catch(() => "")
    : undefined;
  const traceMode = output?.tracePath
    ? await stat(output.tracePath).then(
        (value) => value.mode & 0o777,
        () => undefined,
      )
    : undefined;
  const diagnosticMode = output?.diagnosticPath
    ? await stat(output.diagnosticPath).then(
        (value) => value.mode & 0o777,
        () => undefined,
      )
    : undefined;
  if (output?.tracePath) await rm(dirname(output.tracePath), { recursive: true, force: true });
  if (output?.diagnosticPath) await rm(output.diagnosticPath, { force: true });
  await rm(root, { recursive: true, force: true });
  return { code, stdout, stderr, byLog, handoffExists, trace, traceMode, diagnosticMode };
};

test("launches with the handoff, verifies the Change, and removes the temporary file", async () => {
  const result = await run({
    byResult: {
      changeId: "change-1",
      worktreePath: "WORKTREE_REPLACED_BY_TEST_ENV",
      host: "herdr",
      status: "started",
    },
  });

  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "started");
  assert.equal(output.changeVerified, true);
  assert.match(result.byLog, /content=Implement the change\. /);
  assert.equal(result.handoffExists, false);
});

test("accepts an exact late Herdr session without launching again", async () => {
  const result = await run({
    byResult: {
      error: {
        code: "launch_indeterminate",
        message: "Readiness was not confirmed.",
        details: { changeId: "change-1" },
      },
    },
    herdrMode: "late",
  });

  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "late_active");
  assert.equal(output.changeVerified, true);
  assert.equal(result.byLog.match(/change implement/g)?.length, 1);
  assert.equal(typeof output.tracePath, "string");
  assert.match(result.trace, /"event":"late_session_active"/);
  assert.match(result.trace, /"event":"pane_progress"/);
  assert.equal(result.traceMode, 0o600);
  assert.equal(result.diagnosticMode, 0o600);
});

test("accepts the Herdr agent identity field during late observation", async () => {
  const result = await run({
    byResult: {
      error: {
        code: "launch_indeterminate",
        message: "Readiness was not confirmed.",
      },
    },
    herdrMode: "late",
    agentIdentityField: "agent",
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "late_active");
});

test("rejects contradictory Change Show worktree paths", async () => {
  const result = await run({
    byResult: { changeId: "change-1", host: "herdr", status: "started" },
    showResult: JSON.stringify({
      change: {
        id: "change-1",
        state: "open",
        readiness: "ready",
        worktreePath: "/wrong/worktree",
      },
      worktreePath: "WORKTREE_REPLACED_BY_TEST_ENV",
    }),
  });

  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stdout).changeVerified, false);
});

test("treats an Implement timeout as indeterminate and does not retry", async () => {
  const result = await run({
    byResult: { changeId: "change-1", host: "herdr", status: "started" },
    herdrMode: "late",
    implementDelay: "1",
  });

  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "late_active");
  assert.equal(output.implement.error.code, "launch_indeterminate");
  assert.equal(result.byLog.match(/change implement/g)?.length, 1);
});

test("removes the handoff and stops the launch process when interrupted", async () => {
  const result = await run({
    byResult: { changeId: "change-1", host: "herdr", status: "started" },
    implementDelay: "2",
    interruptAfterMs: 300,
  });

  assert.equal(result.code, 143);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "observer_interrupted");
  assert.equal(result.handoffExists, false);
  assert.match(result.trace, /"event":"observer_interrupted"/);
});

test("preserves rejected Herdr agent details when a launch stays indeterminate", async () => {
  const result = await run({
    byResult: {
      error: {
        code: "launch_indeterminate",
        message: "Readiness was not confirmed.",
        details: { changeId: "change-1" },
      },
    },
    herdrMode: "unmatched",
  });

  assert.equal(result.code, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "launch_indeterminate");
  assert.equal(output.changeVerified, false);
  assert.equal(typeof output.tracePath, "string");
  assert.match(result.trace, /"name":"unexpected-agent"/);
  assert.match(result.trace, /"cwd":".*worktree"/);
  assert.match(result.trace, /"agentStatus":"starting"/);
  assert.ok(result.trace.includes('"agentSessionPath":"/tmp/unexpected.jsonl"'));
});
