---
name: implement
description: "[M] Implement one approved task through completion."
disable-model-invocation: true
---

# Implement

Continue each step until its completion criterion is satisfied.
When authoritative context does not dictate a behavior-affecting decision, record the decision in the decision ledger and continue.
Pause only when an authoritative conflict requires user approval.

## 1. Validate the vertical slice

Read the approved task, its linked specification, its normative references, and the repository instructions.
Read the `vertical-slices` skill.
Implement one approved task rather than the complete specification.

Before recording a baseline or editing code, verify:

- The task is one tracer-bullet vertical slice or one independently passing expand-contract stage.
- Every blocking task is complete.
- Every acceptance criterion has a primary verification seam.
- Authoritative context resolves each required behavior, scope boundary, and constraint.

If the task fails the vertical-slice rules, stop before editing.
Propose flat replacement tasks.
Wait for user approval.

If authoritative context leaves a material conflict unresolved, stop before editing.
Report the conflicting sources and the required user decision.

This step is complete when repository evidence satisfies every check above.

## 2. Record the scoped baseline

Record the current `HEAD` as a full commit SHA.
Record the task draft as the Spec review source.
Keep its linked specification as normative traceability context.
For every acceptance criterion, record its implementation target, public test seam, and verification target.
Record every required validation command or direct verification method.
Start a decision ledger for behavior-affecting choices that authoritative context does not dictate.
For each entry, record the evidence and one classification:

- `local`.
- `user-approved`.
- `deferred to <task>`.

This step is complete when:

- The baseline and task source resolve.
- Every acceptance criterion has an implementation target, public test seam, and verification target.
- Every required validation command or direct verification method is recorded.
- The ledger contains every known behavior-affecting choice.

## 3. Deliver the task

Use `/tdd` at the task's public seams.
Implement independently passing internal steps.
After each step, run focused tests and the relevant type check.
When evidence changes a behavior-affecting choice, update the decision ledger.

When discovered work expands the planned task, reapply the `vertical-slices` skill.
When repository evidence reveals an undeclared prerequisite that blocks the task:

1. Stop before implementing the prerequisite.
2. Report the evidence.
3. Explain the prerequisite's independent observable behavior.
4. Propose a flat task.
5. Explain why the prerequisite blocks the current task.
6. Wait for user approval.

This step is complete when:

- Every acceptance criterion is implemented and demonstrated.
- Every prerequisite is declared and complete.
- Every change belongs to the approved slice or expand-contract stage.

## 4. Verify and review

Run every check recorded in step 2.
Commit the completed task.
Start one `/code-review <baseline> <task-source>` lifecycle with the recorded values.

Fix every in-scope reviewer finding, including Critical, High, and Low findings.
Route findings across the task boundary through the vertical-slice rules.
Until the user approves each routed finding's owner and dependency, pause completion.
If the routed task blocks the current task, wait for its completion before resuming.

Preserve each review-axis latch:

- After `BLOCKED`, keep the axis `pending` while its findings are fixed.
- After `APPROVED WITH REQUIRED COMMENTS`, set the axis to `latched` before fixing its findings.
- After `APPROVED`, set the axis to `latched` immediately.

Each correction batch must resolve every finding from the preceding review invocation.
After each batch, rerun the required checks.
Commit the corrections.
While an axis remains `pending`, invoke `/code-review` with the same baseline and task source.
Rerun only pending axes.

This step is complete when:

- Every in-scope finding is fixed.
- Every routed finding has an approved task owner and dependency.
- Every required check passes.
- Spec and Standards are both `latched`.

## 5. Finish the task

Mark the task complete through the repository's workflow.
Limit the administrative completion update to status, completion evidence, and commit references.
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
Every acceptance criterion must remain demonstrated.
Every required check must pass.
Every reviewer finding must remain resolved.
Both axes must remain latched.
Every implementation decision must be disclosed.
