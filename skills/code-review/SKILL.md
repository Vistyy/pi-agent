---
name: code-review
description: Use when reviewing a bounded branch, task, pull request, or work-in-progress change against its specification and repository standards.
---

# Code Review

Review one bounded diff through two sequential axes:

- **Spec**: The approved task and its normative specification.
- **Standards**: Repository standards and long-term design health.

Each axis has a dedicated reviewer identity.
An axis **latches** when it approves.
It remains latched for the current review lifecycle.
The latch controls reviewer invocation only.
Every reported finding remains required implementation work.

## 1. Pin the review

Record:

- The repository path.
- The fixed point as a full commit SHA.
- The task path.

If the user supplied a fixed point, use it.
Otherwise, ask the user for the fixed point.
Resolve it with `git rev-parse`.
Confirm that `git diff <fixed-point>...HEAD` is not empty.

If the user or caller supplied a task path, use it.
Otherwise, inspect commit messages and local task documents for a task that describes the bounded diff.
If no task matches the diff, ask the user for the task path.
For GitHub references, use `gh-axi` through `pnpx -y gh-axi ...`.

The repository path, full fixed-point SHA, and task path identify one review lifecycle.
On the first invocation, set both axes to `pending`.
On later invocations with the same identity, preserve each axis state from the conversation.
Start a new lifecycle when the repository, fixed point, or task path changes.
Also start a new lifecycle when the user explicitly requests one.

This step is complete when the repository, fixed point, and task resolve.
The diff must be non-empty, and each axis must be `pending` or `latched`.

## 2. Run the Spec gate

When Spec is `pending`, invoke `spec-reviewer` with:

```text
Repository: <repository path>
Fixed point: <full commit SHA>
Task: <task path>
Review the current HEAD according to your identity.
```

Apply the returned status:

- `BLOCKED`: Keep Spec and Standards pending. Return the complete report for correction.
- `APPROVED WITH REQUIRED COMMENTS`: Latch Spec. Keep Standards pending. Return the complete report for correction.
- `APPROVED`: Latch Spec and continue to Standards during this invocation.
- `INVALID REVIEW REQUEST`: Keep both axes pending. Correct and retry the Spec request.
- Missing or unrecognized status: Keep both axes pending. Retry the Spec request with the required fields.

If Spec was already `latched`, continue to Standards.
Never rerun a latched Spec axis.

This step is complete when Spec returns a complete report for correction or permits Standards to run.

## 3. Run Standards

Run Standards after Spec is `latched` and all findings from the preceding Spec invocation are corrected and validated.
When Standards is `pending`, invoke `standards-reviewer` with:

```text
Repository: <repository path>
Fixed point: <full commit SHA>
Review the current HEAD according to your identity.
```

Apply the returned status:

- `BLOCKED`: Keep Standards pending and return the complete report for correction.
- `APPROVED WITH REQUIRED COMMENTS`: Latch Standards immediately.
- `APPROVED`: Latch Standards immediately.
- `INVALID REVIEW REQUEST`: Keep Standards pending. Correct and retry the Standards request.
- Missing or unrecognized status: Keep Standards pending. Retry the Standards request with the required fields.

Never rerun a latched Standards axis.
Corrections after approval do not reopen an axis.
Severity determines whether an axis requires another review.
Every finding still requires a correction or an approved routing decision.

This step is complete when Standards is `pending` with one complete report or is `latched`.

## 4. Report the review state

Present complete reports in execution order under `## Spec` and `## Standards`.
For a latched axis that did not run, report its saved status as `latched`.
For Standards that has not reached its gate, report `pending` and state that Spec corrections come first.
Preserve every reviewer finding without merging, dismissing, reranking, or softening it.

End with both axis states and the required next action:

- Apply every finding returned by this invocation.
- Complete the correction batch and its required validation before invoking review again.
- Rerun only `pending` axes.
- Finish when both axes are `latched`, every finding is resolved, and required validation passes.

Reporting is complete when both axis states and every report from this invocation are visible.
The stated next action must follow from the returned statuses.
