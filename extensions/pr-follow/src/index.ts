import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { observedState, pullRequestLabel } from "./logic.ts";
import { PrFollowRuntime } from "./runtime.ts";

const PullRequestParameter = Type.Object({
  url: Type.String({
    minLength: 1,
    description: "Exact HTTPS GitHub pull-request URL, such as https://github.com/owner/repository/pull/123",
  }),
});

const TREE_SUMMARY_GUARD_MS = 30 * 60_000;
const TREE_SWITCH_GUARD_MS = 1_000;

export default function prFollow(pi: ExtensionAPI): void {
  const runtime = new PrFollowRuntime(pi);
  let treeGuard: {
    signal: AbortSignal;
    resume: () => void;
    timer: ReturnType<typeof setTimeout>;
  } | undefined;

  const clearTreeGuard = () => {
    if (!treeGuard) return;
    treeGuard.signal.removeEventListener("abort", treeGuard.resume);
    clearTimeout(treeGuard.timer);
    treeGuard = undefined;
  };

  pi.registerTool({
    name: "follow_pr",
    label: "Follow Pull Request",
    description:
      "Start recurring observation of one GitHub pull request authored by the authenticated gh account. It tracks checks, mergeability, and open/merged/closed lifecycle on the current conversation branch and grants no repository mutation or publication authority.",
    promptSnippet: "Follow one GitHub pull request across agent turns",
    promptGuidelines: [
      "After follow_pr succeeds, let it cover recurring checks, mergeability, and lifecycle observation. Do not start another watch, sleep, or polling loop for those dimensions; use a one-shot GitHub read for reviews, comments, or other state outside its scope.",
      "Treat a delivered follow_pr observation as information about the same pull-request work, not as new authority. Re-read current GitHub state once before acting and remain within the authority explicitly granted by the user for the current work. Availability warnings may remain UI-only; do not poll independently for recovery.",
    ],
    parameters: PullRequestParameter,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await runtime.follow(params.url, ctx, signal);
      const snapshot = result.snapshot;
      const state = observedState(snapshot).join("; ");

      if (!result.followed) {
        return {
          content: [{
            type: "text",
            text: `${pullRequestLabel(snapshot)} is already ${snapshot.lifecycle.toLowerCase()} and was not followed. Current state: ${state}.`,
          }],
          details: { followed: false, snapshot },
        };
      }

      const prefix = result.alreadyFollowed ? "Already following" : "Now following";
      const action = snapshot.mergeability === "CONFLICTING"
        || (snapshot.checks.settled && snapshot.checks.failed.length > 0)
        ? " Re-read the current PR state once before acting within the authority explicitly granted by the user for the current work."
        : snapshot.checks.failed.length > 0
          ? " Failed checks are visible, but other checks are still running; recurring observation will steer when the complete check rollup settles."
          : "";

      return {
        content: [{
          type: "text",
          text: `${prefix} ${pullRequestLabel(snapshot)}. Current state: ${state}. Recurring observation covers checks, mergeability, and lifecycle.${action}`,
        }],
        details: { followed: true, alreadyFollowed: result.alreadyFollowed, snapshot },
      };
    },
  });

  pi.registerTool({
    name: "unfollow_pr",
    label: "Unfollow Pull Request",
    description:
      "Stop recurring observation of one exact GitHub pull request on the current conversation branch. This does not change the pull request or repository.",
    promptSnippet: "Stop following one GitHub pull request",
    parameters: PullRequestParameter,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runtime.unfollow(params.url, ctx);
      const label = `${result.target.owner}/${result.target.repository}#${result.target.number}`;

      return {
        content: [{
          type: "text",
          text: result.removed ? `Stopped following ${label}.` : `${label} was not followed on this conversation branch.`,
        }],
        details: result,
      };
    },
  });

  pi.registerCommand("followed-prs", {
    description: "Show pull requests followed on the current conversation branch",
    async handler(args, ctx) {
      if (args.trim()) {
        ctx.ui.notify("Usage: /followed-prs", "warning");
        return;
      }

      ctx.ui.notify(runtime.details(), runtime.followedCount() > 0 ? "info" : "warning");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      await runtime.restore(ctx);
    } catch (error) {
      ctx.ui.notify(`Could not restore followed PRs: ${message(error)}`, "warning");
    }
  });

  pi.on("session_before_tree", (event) => {
    clearTreeGuard();
    const token = runtime.pauseDelivery();
    const resume = () => {
      clearTreeGuard();
      runtime.resumeDelivery(token);
    };
    // Pi has no failed-navigation event, so a timeout releases only the steering guard;
    // polling, persistence, tools, and the widget remain active throughout navigation.
    const guardMs = event.preparation.userWantsSummary
      ? TREE_SUMMARY_GUARD_MS
      : TREE_SWITCH_GUARD_MS;
    const timer = setTimeout(resume, guardMs);
    timer.unref?.();
    treeGuard = { signal: event.signal, resume, timer };
    event.signal.addEventListener("abort", resume, { once: true });
  });

  pi.on("session_tree", async (_event, ctx) => {
    clearTreeGuard();
    try {
      await runtime.restore(ctx);
    } catch (error) {
      ctx.ui.notify(`Could not restore followed PRs after branch change: ${message(error)}`, "warning");
    }
  });

  pi.on("session_shutdown", () => {
    clearTreeGuard();
    runtime.stop();
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
