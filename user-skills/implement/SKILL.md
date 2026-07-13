---
name: implement
description: "[M] Implement one approved task through completion."
disable-model-invocation: true
---

# Implement

## 1. Validate the vertical slice

Read the requested task, its linked specification and normative references, the repository instructions, and the `vertical-slices` skill.
Implementation starts from one approved task rather than a bare specification.
Confirm that the task is one tracer-bullet vertical slice or one independently green expand-contract stage, every blocker is complete, and every acceptance criterion has a primary verification seam.
If the task fails the vertical slice rules, stop before recording a baseline or editing and propose flat replacement tasks for user approval.

Completion criterion: repository evidence confirms every vertical slice rule, every blocker is complete, and every acceptance criterion has a primary verification seam.

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
Invoke `/code-review <baseline> <task-source>` with the recorded values.
Resolve every finding by fixing confirmed in-scope problems or recording evidence that a judgement call does not apply.
Route a confirmed finding that crosses the task boundary through the vertical slice rules.
For each in-scope fix, rerun the required checks, commit, and invoke `/code-review` again with the same baseline and task source.

Completion criterion: every required check passes and every Standards and Spec finding for the task is resolved.

## 5. Finish

Mark the task done through the repository's workflow.
If this changes tracked files, commit the update and run the verification and review loop again.
Report the final commit, verification evidence, and completed task reference.

Completion criterion: the implementation is committed and reviewed, the task is marked done, and any tracked completion update is committed and reviewed.
