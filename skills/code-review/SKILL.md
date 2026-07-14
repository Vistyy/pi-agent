---
name: code-review
description: Review a bounded change along Standards and Spec axes. Use when the user wants a branch, task, pull request, or work-in-progress change reviewed from a fixed point.
---

# Code Review

Review one bounded diff through two independent axes:

- **Standards**: repository standards and long-term design health.
- **Spec**: the approved task and its normative specification.

Each axis has a dedicated reviewer identity.
A review axis **latches** when it approves and remains latched for the rest of that review lifecycle.

## 1. Pin the review

Record:

- The repository path.
- The fixed point as a full commit SHA.
- The task path.

Use the fixed point the user supplied.
If none was supplied, ask for it.
Resolve it with `git rev-parse` and confirm `git diff <fixed-point>...HEAD` is non-empty.

Use a task path supplied by the user or caller.
Otherwise, identify it from commit messages or matching local task documents.
If no task can be found, ask for it.
For GitHub references, use `gh-axi` through `pnpx -y gh-axi ...`.

The repository, full fixed-point SHA, and task path identify one review lifecycle.
On the first invocation, initialize both axes as pending.
On later invocations with the same values, preserve their latch state from the conversation.
Start a new lifecycle only when one of those values changes or the user explicitly requests a fresh review.

Completion criterion: the repository, fixed point, and task resolve, the diff is non-empty, and both axis states are known.

## 2. Run pending axes

Run all pending axes in one parallel `subagent` call with the repository as each child's working directory.
Do not run a latched axis.

For each pending axis, invoke only its matching identity.
Invoke `standards-reviewer` only when Standards is pending.
Invoke `spec-reviewer` only when Spec is pending.
Give every invoked identity only:

```text
Repository: <repository path>
Fixed point: <full commit SHA>
Task: <task path>
Review the current HEAD according to your identity.
```

The identities own source discovery, coverage, judgment, severity, and reporting.
Do not add review policy, word limits, selected hunks, suspected findings, or abbreviated review instructions to their tasks.

Completion criterion: every pending axis returns one complete report beginning with a valid status.

## 3. Update latches

Interpret each report independently:

- `BLOCKED`: keep the axis pending.
- `APPROVED WITH REQUIRED COMMENTS`: latch the axis immediately.
- `APPROVED`: latch the axis immediately.
- `INVALID REVIEW REQUEST`: keep the axis pending and correct the missing input before retrying.
- Missing or unrecognized status: treat the response as invalid, keep the axis pending, and retry the same identity with a valid request.

A latch is permanent for this review lifecycle.
Corrections made after approval do not reopen that axis.
Severity controls re-review, not whether the caller must apply a finding.

Completion criterion: every report has updated exactly one axis state and every approval is latched.

## 4. Report

Present the complete reports under `## Standards` and `## Spec`.
For a latched axis that was not run, report its saved approval status as `latched` without reconstructing its findings.
Do not merge, dismiss, rerank, or soften reviewer findings.

End with both axis states and the required next action:

- Apply every reported finding.
- Rerun only pending axes after their findings are corrected.
- Finish when both axes are latched and required validation passes.

Completion criterion: both reports or saved latch states are visible, every pending axis is identified, and the next action follows directly from the statuses.
