---
name: code-review
description: Review a bounded change along Spec and Standards axes. Use when the user wants a branch, task, pull request, or work-in-progress change reviewed from a fixed point.
---

# Code Review

Review one bounded diff through two sequential axes:

- **Spec**: the approved task and its normative specification.
- **Standards**: repository standards and long-term design health.

Each axis has a dedicated reviewer identity.
A review axis **latches** when it approves and remains latched for the rest of that review lifecycle.
A latch controls reviewer invocation only.
Every reported finding remains required implementation work.

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

## 2. Run the Spec gate

When Spec is pending, invoke `spec-reviewer` with:

```text
Repository: <repository path>
Fixed point: <full commit SHA>
Task: <task path>
Review the current HEAD according to your identity.
```

Interpret its status immediately:

- `BLOCKED`: keep Spec pending, keep Standards pending, and return for a complete correction batch.
- `APPROVED WITH REQUIRED COMMENTS`: latch Spec, keep Standards pending, and return for a complete correction batch.
- `APPROVED`: latch Spec and continue to Standards in this invocation.
- `INVALID REVIEW REQUEST`: keep both axes pending, correct the request, and retry Spec.
- Missing or unrecognized status: keep both axes pending and retry Spec with a valid request.

When Spec was already latched before this invocation, continue to Standards.
Never rerun a latched Spec axis.

Completion criterion: the Spec result either returns the invocation for a complete correction batch or permits Standards to run.

## 3. Run Standards

Run Standards only after Spec is latched and every Spec finding returned by the preceding invocation has been corrected.
When Standards is pending, invoke `standards-reviewer` with:

```text
Repository: <repository path>
Fixed point: <full commit SHA>
Review the current HEAD according to your identity.
```

Interpret its status:

- `BLOCKED`: keep Standards pending.
- `APPROVED WITH REQUIRED COMMENTS`: latch Standards immediately.
- `APPROVED`: latch Standards immediately.
- `INVALID REVIEW REQUEST`: keep Standards pending, correct the request, and retry it.
- Missing or unrecognized status: keep Standards pending and retry it with a valid request.

Never rerun a latched Standards axis.
Corrections made after approval do not reopen an axis.
Severity controls re-review, not whether the caller applies a finding.

Completion criterion: Standards is pending with one complete report returned for correction, or latched.

## 4. Report

Present the complete reports in execution order under `## Spec` and `## Standards`.
For a latched axis that was not run, report its saved approval status as `latched` without reconstructing its findings.
For Standards that has not reached its gate, report it as `pending` and state that Spec corrections come first.
Do not merge, dismiss, rerank, or soften reviewer findings.

End with both axis states and the required next action:

- Apply every finding returned by this invocation.
- Invoke review again only after that complete correction batch is implemented and required validation passes.
- Rerun only pending axes.
- Finish when both axes are latched, every reported finding is resolved, and required validation passes.

Completion criterion: both axis states are visible, every report from this invocation is preserved, and the next action follows directly from the statuses.
