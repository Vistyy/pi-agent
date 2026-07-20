---
name: code-review
description: Use when reviewing a bounded branch, task, pull request, or work-in-progress change against its specification and repository standards.
---

# Code Review

Review one bounded diff through two sequential axes:

- **Spec**: The approved task and normative specification.
- **Standards**: Repository standards and long-term design health.

Each axis has a dedicated reviewer identity.
An axis **latches** when it approves and remains latched for the lifecycle.
The latch controls invocation only.
Every finding remains required implementation work.

## 1. Pin the review

Record the repository path, fixed point, and task path.

- Use a supplied fixed point.
- When the fixed point is not supplied, ask for it.
- Resolve the fixed point with `git rev-parse`.
- Record the full commit SHA.
- Confirm that `git diff <fixed-point>...HEAD` is non-empty.
- Use a supplied task path.
- Otherwise, inspect commit messages and local task documents for a matching task.
- When no task matches the diff, ask for the task path.
- For GitHub references, use `gh-axi` through `pnpx -y gh-axi ...`.

The repository path, full fixed-point SHA, and task path identify one lifecycle.
On the first invocation, set both axes to `pending`.
On later invocations with the same identity, preserve both axis states.
When the repository, fixed point, or task path changes, start a new lifecycle.
When the user requests a new lifecycle, start one.

This step is complete when all three identifiers resolve, the diff is non-empty, and each axis is `pending` or `latched`.

## 2. Run the Spec gate

When Spec is `pending`, invoke `spec-reviewer` with:

```text
Repository: <repository path>
Fixed point: <full commit SHA>
Task: <task path>
Review the current HEAD according to your identity.
```

Apply the returned status:

- `BLOCKED`: Keep both axes `pending`.
  Return the complete report for correction.
- `APPROVED WITH REQUIRED COMMENTS`: Latch Spec.
  Keep Standards `pending`.
  Return the complete report for correction.
- `APPROVED`: Latch Spec.
  Continue to Standards during this invocation.
- `INVALID REVIEW REQUEST`: Keep both axes `pending`.
  Correct and retry the request.
- Missing or unrecognized status: Keep both axes `pending`.
  Retry with the required fields.

When Spec is `latched`, continue to Standards.
Do not rerun a latched Spec axis.

This step is complete when Spec returns a complete correction report or permits Standards to run.

## 3. Run Standards

Run Standards after Spec is `latched` and all findings from the preceding Spec invocation are corrected and validated.
When Standards is `pending`, invoke `standards-reviewer` with:

```text
Repository: <repository path>
Fixed point: <full commit SHA>
Review the current HEAD according to your identity.
```

Apply the returned status:

- `BLOCKED`: Keep Standards `pending`.
  Return the complete report for correction.
- `APPROVED WITH REQUIRED COMMENTS`: Latch Standards immediately.
- `APPROVED`: Latch Standards immediately.
- `INVALID REVIEW REQUEST`: Keep Standards `pending`.
  Correct and retry the request.
- Missing or unrecognized status: Keep Standards `pending`.
  Retry with the required fields.

Do not rerun a latched Standards axis.
Corrections after approval do not reopen an axis.
Severity determines whether an axis requires another review.
Every finding requires a correction or an approved routing decision.

This step is complete when Standards is `pending` with one complete report or is `latched`.

## 4. Report the review state

Present complete reports in execution order under `## Spec` and `## Standards`.
When a latched axis did not run, report its saved status as `latched`.
Until Standards reaches its gate, report it as `pending` and state that Spec corrections come first.
Preserve every finding without merging, dismissing, reranking, or softening it.

End with both axis states and the required next action:

- Apply every finding returned by this invocation.
- Complete the correction batch and required validation before invoking review again.
- Rerun only `pending` axes.
- Finish when both axes are `latched`, every finding is resolved, and required validation passes.

Reporting is complete when both states and every report from this invocation are visible.
The next action must follow from the returned statuses.
