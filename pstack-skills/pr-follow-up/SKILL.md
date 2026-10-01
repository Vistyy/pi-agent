---
name: pr-follow-up
description: >-
  Use when asked to check or babysit existing pull requests, address human or
  automated review findings, fix failing checks, or watch until merge-ready.
  Includes authorized development deployment workflows needed for verification.
  Not for creating or merging PRs, enabling auto-merge, or production deployment.
---

# Follow up on a pull request

Work on existing PRs through the requested endpoint. Do not start follow-up automatically when opening a PR. This skill does not authorize merging, auto-merge, production deployment, or bypassing approvals and protections.

## 1. Set scope and inspect

Choose the scope that matches the request:
- **Check:** inspect once and report. Do not change code, threads, workflow runs, or deployments.
- **Review:** investigate requested findings and make authorized corrections. Do not add unrelated CI or deployment work.
- **Drive:** address requested blockers and watch until merge-ready, a human decision is needed, or the user stops the task.

Identify the repository, requested PRs, owning branches, dependencies, current head and base revisions, and permissions. Preserve unrelated local changes and avoid duplicating another actor's watch.

Use the [PR observer](references/watcher.md) to inspect checks, unresolved threads, and GitHub readiness. Read its usage before running it. Use installed `gh-axi` for other supported GitHub operations and inspect its current help. Use raw `gh` when a required operation or guard is missing. Before classifying findings, read the full review discussions. Observer excerpts are not enough.

For Check, report the current state and stop. Missing information is unknown, not a pass.

## 2. Resolve scoped blockers

For blockers within scope, inspect conflicts first. Then investigate review findings and checks as requested. Consult the reference for the work needed:
- [Review triage](references/review-triage.md) for deciding whether to fix, dismiss, or ask about a finding.
- [Checks and development deployment](references/checks-and-deployment.md) for diagnosing checks or running authorized verification workflows.

Fix proven issues on the owning branch. Establish a reproducer when appropriate, verify the corrected behavior, and batch related fixes before an authorized commit or push. Re-read PR state afterward.

For dependent PRs, work from the lowest unmerged PR upward within scope. Report an out-of-scope blocking parent. Re-read dependencies after another actor merges a PR; do not assume retargeting preserved the intended base. If the owning PR is already merged, report the follow-up needed rather than rewriting history or silently opening a new PR.

Resolve conflicts against the affected callers and contracts. Rebase or retarget only within the agreed workflow, and confirm force-pushes. Do not reset unrelated work or reshape a stack to obtain green checks.

## 3. Verify the current revision

Record the tested head, base, workflow and run identities, and evidence. Reassess affected verification when the head or base changes. Older green checks, matching patch IDs, and commit subjects do not prove unchanged behavior. Do not describe the same agent's checks as independent review.

Keep CI, required reviews, mergeability, unresolved blockers, and verification of the affected user workflow separate. A GitHub readiness candidate is not proof of product behavior. Confirm expected workflows and repository-specific rules before reporting merge-readiness.

If authorized to edit the PR description, align it with the published change and actual verification. Follow the repository template.

## 4. Watch through the requested endpoint

For a requested watch, use the observer's bounded wait and result guidance. Do not add another polling loop. Diagnose reported blockers, make authorized fixes, then resume the watch. After a timeout or interruption, inspect current PRs, runs, and watcher state before resuming.

Keep the watch in the foreground unless a tracked facility reliably notifies this agent on completion. Do not install a scheduler or claim monitoring without a live feedback path. Answer intervening questions without forgetting the requested watch.

Stop at the agreed endpoint, a human-only approval or decision, lost access, or an explicit stop. Merge-ready is not permission to merge or queue a merge. Report the current revisions, checks and reviews, findings addressed with evidence, verification actually completed, remaining blockers, and required human action.
