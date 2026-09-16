import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  normalizePullRequest,
  parsePullRequestUrl,
  pullRequestKey,
  queryOwnedPullRequest,
} from "../src/github.ts";

test("parses and canonicalizes exact pull-request URLs", () => {
  const target = parsePullRequestUrl("https://github.com/acme/widgets/pull/42/");

  assert.deepEqual(target, {
    host: "github.com",
    owner: "acme",
    repository: "widgets",
    number: 42,
    url: "https://github.com/acme/widgets/pull/42",
  });
  assert.equal(pullRequestKey(target!), "github.com/acme/widgets#42");
  assert.equal(
    pullRequestKey(parsePullRequestUrl("https://github.com/ACME/Widgets/pull/42")!),
    "github.com/acme/widgets#42",
  );

  assert.equal(parsePullRequestUrl("https://github.com/acme/widgets/issues/42"), undefined);
  assert.equal(parsePullRequestUrl("not a URL"), undefined);
});

test("normalizes GitHub Actions and legacy status contexts", () => {
  const requested = parsePullRequestUrl("https://github.com/acme/widgets/pull/42")!;
  const snapshot = normalizePullRequest(requested, {
    url: requested.url,
    author: { login: "Vistyy" },
    state: "OPEN",
    headRefOid: "abc123",
    mergeable: "MERGEABLE",
    statusCheckRollup: [
      {
        __typename: "CheckRun",
        name: "lint",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        detailsUrl: "https://github.com/acme/widgets/actions/runs/1",
      },
      {
        __typename: "CheckRun",
        name: "linux",
        status: "COMPLETED",
        conclusion: "FAILURE",
        detailsUrl: "https://github.com/acme/widgets/actions/runs/2",
      },
      { __typename: "CheckRun", name: "windows", status: "IN_PROGRESS", conclusion: null },
      { __typename: "StatusContext", context: "external", state: "ERROR" },
      { __typename: "StatusContext", context: "deploy", state: "SUCCESS" },
    ],
  });

  assert.ok(snapshot);
  assert.equal(snapshot.checks.total, 5);
  assert.equal(snapshot.checks.passed, 2);
  assert.equal(snapshot.checks.pending, 1);
  assert.equal(snapshot.checks.settled, false);
  assert.deepEqual(snapshot.checks.failed.map((check) => check.name), ["external", "linux"]);
});

test("requires the authenticated GitHub account to author the pull request", async () => {
  const response = (authorLogin: string, viewerLogin: string): Pick<ExtensionAPI, "exec"> => ({
    exec: async (_command, args) => args[0] === "pr"
      ? {
          code: 0,
          stdout: JSON.stringify({
            url: "https://github.com/acme/widgets/pull/42",
            author: { login: authorLogin },
            state: "OPEN",
            headRefOid: "abc123",
            mergeable: "MERGEABLE",
            statusCheckRollup: [],
          }),
          stderr: "",
          killed: false,
        }
      : { code: 0, stdout: `${viewerLogin}\n`, stderr: "", killed: false },
  });

  const owned = await queryOwnedPullRequest(
    response("Vistyy", "vistyy"),
    "https://github.com/acme/widgets/pull/42",
  );
  assert.equal(owned.ok, true);

  const foreign = await queryOwnedPullRequest(
    response("contributor", "Vistyy"),
    "https://github.com/acme/widgets/pull/42",
  );
  assert.equal(foreign.ok, false);
  if (!foreign.ok) assert.equal(foreign.kind, "not-owned");
});

test("treats unknown check conclusions as pending instead of prematurely settled", () => {
  const requested = parsePullRequestUrl("https://github.com/acme/widgets/pull/42")!;
  const snapshot = normalizePullRequest(requested, {
    url: requested.url,
    author: { login: "Vistyy" },
    state: "OPEN",
    headRefOid: "abc123",
    mergeable: "UNKNOWN",
    statusCheckRollup: [
      { __typename: "CheckRun", name: "new-conclusion", status: "COMPLETED", conclusion: "FUTURE_VALUE" },
    ],
  });

  assert.ok(snapshot);
  assert.equal(snapshot.checks.pending, 1);
  assert.equal(snapshot.checks.settled, false);
});
