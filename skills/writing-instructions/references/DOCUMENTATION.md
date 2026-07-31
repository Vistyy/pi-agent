# Documentation

This policy applies across projects.
It governs project documentation and explanatory content in comments and instructional reference.
The parent skill governs behavioral instructions.
Project instructions may identify local audiences, authorities, constraints, and required artifacts.
Project instructions must not weaken this policy.

## Purpose

Documentation must help a reader understand or operate the current system.
First consider code, executable interfaces, tests, schemas, and generated reference material.
Use documentation when those sources do not make the necessary knowledge clear and available to the audience.

Documentation must close a concrete knowledge gap for an identified audience.
Documentation must not exist only to record that work occurred.
A code change does not require a documentation change unless it changes a supported claim or creates a knowledge gap for a current audience.

## Select the authoritative medium

Put each claim in the medium that demonstrates it most directly.

- Code and schemas define implemented structure and machine-enforced behavior.
- Tests demonstrate consequential behavior and compatibility contracts.
- Generated reference material describes interfaces that can be derived reliably.
- Task systems contain proposed work, implementation intent, progress, dependencies, and acceptance evidence.
- Version control contains file history and implementation chronology.
- Documentation explains current concepts, supported use, non-obvious constraints, operational procedures, and durable rationale.
- Comments explain non-obvious local intent, constraints, and rationale beside the applicable code.
- Instructional reference explains non-obvious concepts and constraints that an actor needs to follow behavioral instructions.

Keep each claim in the medium that owns it.
Link to that authority when the reader needs access to it.
Add explanatory prose only when the authority does not communicate the meaning that the audience needs.

## Admit a document or passage

Keep a document or passage only when all of these conditions are true:

1. It serves an identified current audience.
2. It answers a current question that the audience can reasonably have.
3. A more authoritative source does not make the answer sufficiently clear and available to the audience.
4. The artifact is the correct delivery boundary for the answer.
5. The expected value of the answer exceeds its maintenance and attention cost.
6. One authoritative location owns the answer.

Delete material that fails this test.
Do not retain material in documentation because it might become useful later.
Version control preserves deleted project material.
Use the applicable task or record system for information that must remain queryable outside version control.

## Describe the current system

Describe supported behavior, current concepts, active constraints, and the supported path directly.
Do not narrate the sequence of changes that produced the current system.
Do not add implementation notes, task summaries, completion reports, or lists of files changed to documentation, comments, or instructional reference.
Do not preserve superseded plans, specifications, proposals, spikes, or issue records as current documentation.

Comments must not restate code that normal navigation makes clear.
Instructions must direct their actor to the supported behavior or path.
When a reader can still encounter a retired path, name the supported replacement.

Retain past context only when it explains a current constraint, compatibility contract, or decision.
State the current decision and the constraint that makes the context relevant.
Remove the context when the constraint no longer applies.

## Update documentation by reader impact

For each change, identify whether the change alters an existing supported claim or creates a new knowledge gap for a current audience.

Update documentation when the change affects one or more of these reader needs:

- how a supported interface is used;
- what behavior or compatibility contract the reader can rely on;
- a concept or domain term that the reader must understand;
- a non-obvious constraint or failure-recovery procedure;
- an operational or contributor procedure that the reader must perform;
- durable rationale required to make a safe future decision.

Do not update documentation when the change only affects implementation details that code and tests communicate sufficiently.
Do not add a new document when an existing authority can own the changed claim.
Do not add prose solely because a Task completed, a file changed, or a new internal type or function exists.

A documentation review for a code change is complete when every affected supported claim is current.
The review must also address each new reader knowledge gap.
The review must not expand unaffected documentation.

## Write for use

Name the audience and the question before writing.
Start with the information required for the reader's next decision or action.
Use current project terms consistently.
Describe the supported state in present tense.
Separate requirements, procedures, explanation, and reference when the distinction changes how readers use the content.
Use examples only when they clarify a boundary or realistic operation.

Prefer the smallest structure that preserves navigation and authority.
Use a documentation map only when readers cannot identify the correct authority through normal navigation.
Do not impose a uniform directory structure without a shared reader need.

For separate audiences, keep the shared claim in its authority and provide only the necessary audience-specific entry point or context.
Public documentation must not require private or unshipped material.

## Maintain authority

When a change replaces a claim, update its authority and remove superseded descriptions in the same change.
When documents disagree, resolve the supported behavior from executable evidence and applicable decisions before rewriting prose.
Do not preserve both descriptions as alternatives unless the system supports both alternatives.

Verify that each retained passage answers its identified question without requiring task history.
Verify commands and procedures through the supported interface when practical.
Verify links and generated references with the repository's supported checks.

Documentation work is complete when:

- each retained document serves a current audience and question;
- each supported claim has one authority;
- each changed claim matches the current system;
- task history and implementation narration are absent from current documentation;
- obsolete and duplicate material is removed;
- required procedures are executable;
- the project's supported documentation checks pass.
