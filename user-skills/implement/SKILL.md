---
name: implement
description: "[M] Implement one approved task through completion."
disable-model-invocation: true
---

# Implement

## 1. Validate the vertical slice

Read the requested task, its linked specification and normative references, the repository instructions, and the `vertical-slices` skill.
Implementation starts from one approved task rather than a bare specification.
Run a silent readiness audit across the task, its normative references, prior decisions, and repository evidence.
Treat each supported behavior, scope boundary, and constraint as settled; collect only material gaps or conflicts as open points.
Confirm that the task is one tracer-bullet vertical slice or one independently green expand-contract stage, every blocker is complete, and every acceptance criterion has a primary verification seam.
If the task fails the vertical slice rules, stop before recording a baseline or editing and propose flat replacement tasks for user approval.
If an open point cannot be resolved from authoritative context, stop before recording a baseline or editing, report the exact unresolved point, and wait for the user's decision.

Completion criterion: repository evidence confirms every vertical slice rule, every blocker is complete, every acceptance criterion has a primary verification seam, and every material behavior, scope boundary, and constraint is settled.

## 2. Record the scoped baseline

Record the current `HEAD` as a full commit SHA.
Record the task draft as the scoped Spec review source.
Keep its linked specification as normative traceability context rather than expanding the review to unrelated tasks.
Record every required validation command or direct verification method.
Map every task acceptance criterion to an implementation target, public test seam, and verification target.

Completion criterion: the baseline resolves, the scoped task source and required checks are recorded, and every task behavior has an implementation and verification target.

## 3. Deliver the task

Use `/tdd` at the task's public seams.
Implement the task through independently green internal steps.
After each step, run its focused tests and relevant typecheck.

Return to the `vertical-slices` skill whenever discovery expands the planned work and follow its scope-routing rules.
When repository evidence reveals an undeclared prerequisite that must complete before the current task can succeed, stop before continuing.
Report the evidence, why the prerequisite is a separate vertical slice, the proposed flat task, and why it blocks the current task, then wait for user approval.

Completion criterion: every acceptance criterion is implemented and directly demonstrated, every required prerequisite is declared and complete, and every change belongs to the approved vertical slice or expand-contract stage.

## 4. Verify and review strictly

Run every required check recorded in step 2 and commit the completed task.
Start one `/code-review <baseline> <task-source>` lifecycle with the recorded values.
Treat every reviewer finding as binding.
Fix every in-scope Critical, High, and Low finding rather than adjudicating it against the implementing agent's preferences.
Route a finding that crosses the task boundary through the vertical slice rules.
A routed finding pauses completion until the user approves its task owner and dependency relationship.
When it is a prerequisite for the current task, wait for that prerequisite to complete before resuming.

Preserve each review axis latch:

- `BLOCKED` remains pending after its findings are fixed.
- `APPROVED WITH REQUIRED COMMENTS` latches before its findings are fixed.
- `APPROVED` latches immediately.

A correction batch resolves every finding returned by the preceding review invocation.
After the complete correction batch is implemented, rerun the required checks and commit.
Invoke `/code-review` again with the same baseline and task source only while an axis remains pending.
The review lifecycle reruns pending axes and never reruns a latched axis.

Completion criterion: every in-scope finding is fixed, every routed finding has an approved task owner and dependency, every required check passes, and both Standards and Spec axes are latched.

## 5. Finish

Mark the task done through the repository's workflow.
The completion update may change only administrative status, completion evidence, and commit references.
Commit that update and rerun the required checks without reopening either review latch.
A substantive implementation or contract change returns to delivery and starts a new review lifecycle after it is complete.
Report the final commit, verification evidence, completed task reference, and both latched review statuses.

Completion criterion: the reviewed implementation is committed, the administrative completion update is committed, every acceptance criterion remains demonstrated, every reviewer finding remains resolved, every required check passes, both review axes are latched, and the task is marked done.
