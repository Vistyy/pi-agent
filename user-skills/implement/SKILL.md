---
name: implement
description: "Implement an issue or PRD through completion."
disable-model-invocation: true
---

# Implement

## 1. Define the vertical slice

Read the requested issue or PRD, its normative references, and the repository instructions.
Record the current `HEAD` as a full commit SHA for the review baseline.
Record a stable path or identifier for the spec source and enumerate every required validation command or direct verification method.
Turn every acceptance criterion, required observable behavior, and discovered repository-local prerequisite into an exhaustive checklist with an implementation target, public test seam, and verification target.

Completion criterion: the baseline resolves, the spec source and required checks are recorded, and every requested behavior and known repository-local prerequisite has an implementation and verification target.

## 2. Deliver the vertical slice

Use `/tdd` at the checklist's public seams.
Implement and verify the checklist in vertical slices.
The implementation owns every change within the repository needed to satisfy the requested behavior, including changes to existing private contracts, shared infrastructure, and earlier abstractions.
Add every newly discovered repository-local prerequisite to the checklist and complete it within this implementation.

Escalate only when a required external dependency is unavailable, authoritative requirements conflict, or the requested behavior cannot be achieved within the repository's declared platform constraints.
Report the evidence and the exact decision needed from the user.

Completion criterion: every checklist item, including every discovered repository-local prerequisite, is implemented and demonstrated by focused tests or other direct evidence, with none deferred.

## 3. Verify and review

After each vertical slice, run its focused tests and relevant typecheck.
After the final code change, run every required check recorded in step 1 and commit the completed slice.
Invoke `/code-review <baseline> <spec-source>` with the recorded values.
Resolve every finding by fixing confirmed problems or recording evidence that a judgement call does not apply.
For each fix, rerun the required checks, commit, and invoke `/code-review` again with the same baseline and spec source.

Completion criterion: every required check passes and every Standards and Spec finding is resolved.

## 4. Finish

Mark the requested work item done using the repository's workflow.
If this changes tracked files, commit the update and run the verification and review loop again.
Report the final commit, verification evidence, and completed work-item reference.

Completion criterion: the implementation is committed and reviewed, the work item is marked done, and any tracked completion update is committed and reviewed.
