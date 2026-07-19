---
name: implement
description: "[M] Implement one approved task through completion."
disable-model-invocation: true
---

# Implement

## 1. Validate the vertical slice

Read:

- The approved task.
- Its linked specification and normative references.
- The repository instructions.
- The `vertical-slices` skill.

Implement one approved task rather than a complete specification.

Before you record a baseline or edit code, verify:

- The task is one tracer-bullet vertical slice or one independently passing expand-contract stage.
- Every blocking task is complete.
- Every acceptance criterion has a primary verification seam.
- Authoritative context settles each required behavior, scope boundary, and constraint.

If the task fails the vertical-slice rules, stop before editing.
Propose flat replacement tasks and wait for user approval.

If authoritative context does not resolve a material conflict, stop before editing.
Report the conflicting sources and the decision required from the user.

This step is complete when repository evidence satisfies every listed check.

## 2. Record the scoped baseline

Record the current `HEAD` as a full commit SHA.
Record the task draft as the Spec review source.
Keep its linked specification as normative traceability context for the task.

Record every required validation command or direct verification method.
For each acceptance criterion, record:

- The implementation target.
- The public test seam.
- The verification target.

Start a decision ledger for behavior-affecting choices that authoritative context does not dictate.
For each entry, record the evidence and one classification:

- `local`.
- `user-approved`.
- `deferred to <task>`.

This step is complete when the baseline and task source resolve.
Every required validation command or direct verification method must be recorded.
Every acceptance criterion must have implementation and verification targets.
Every known behavior-affecting choice must be in the decision ledger.

## 3. Deliver the task

Use `/tdd` at the task's public seams.
Implement the task in independently passing internal steps.
After each step, run its focused tests and relevant type check.
Update the decision ledger when evidence introduces or changes a behavior-affecting choice.

If discovered work expands the planned task, reapply the `vertical-slices` skill.
If repository evidence reveals an undeclared prerequisite that must complete before the current task can succeed:

1. Stop before implementing the prerequisite.
2. Report the evidence.
3. Explain its independent observable behavior.
4. Propose a flat task.
5. Explain why it blocks the current task.
6. Wait for user approval.

This step is complete when every acceptance criterion is implemented and demonstrated.
Every prerequisite must be declared and complete.
Every change must belong to the approved slice or expand-contract stage.

## 4. Verify and review

Run every check recorded in step 2.
Commit the completed task.
Start one `/code-review <baseline> <task-source>` lifecycle with the recorded values.

Apply every reviewer finding.
Fix every in-scope finding, including Critical, High, and Low findings.
Route a finding across the task boundary through the vertical-slice rules.
A routed finding pauses completion until the user approves its owner and dependency relationship.
If the routed task blocks the current task, wait for it to complete before resuming.

Preserve each review-axis latch:

- After `BLOCKED`, the axis remains `pending` when its findings are fixed.
- After `APPROVED WITH REQUIRED COMMENTS`, the axis becomes `latched` before its findings are fixed.
- After `APPROVED`, the axis becomes `latched` immediately.

A correction batch resolves every finding from the preceding review invocation.
After the correction batch, rerun the required checks and commit the corrections.
Invoke `/code-review` with the same baseline and task source while an axis remains `pending`.
Rerun only pending axes.

This step is complete when:

- Every in-scope finding is fixed.
- Every routed finding has an approved task owner and dependency.
- Every required check passes.
- Spec and Standards are both `latched`.

## 5. Finish the task

Mark the task complete through the repository's workflow.
The administrative completion update can change only status, completion evidence, and commit references.
Commit the administrative update.
Rerun the required checks without reopening either review latch.

If this stage requires a substantive implementation or contract change, return to delivery.
After that change is complete, start a new review lifecycle.

Report:

- The final commit.
- Verification evidence.
- The completed task reference.
- Both latched review statuses.
- The decision ledger with every confirmed deferred owner.

The workflow is complete when the implementation and administrative update are committed and the task is marked complete.
Every acceptance criterion must remain demonstrated, and every required check must pass.
Every reviewer finding must remain resolved, both axes must remain latched, and every implementation decision must be disclosed.
