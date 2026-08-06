# Documentation

This policy applies to technical documentation and explanatory comments.
Use documentation to help an identified current audience understand or operate the supported system.

## Decide whether prose is needed

Identify the audience and the question before writing.
Keep a document or passage only when all of these conditions are true:

1. It answers a current question that the audience can reasonably have.
2. A more authoritative source does not make the answer sufficiently clear and available.
3. The artifact is the correct delivery boundary for the answer.
4. The answer is worth its maintenance and attention cost.
5. One authoritative location owns the answer.

Do not add documentation only because work occurred or a file changed.
Use the applicable task system for plans, implementation intent, progress, and acceptance evidence.
Use version control for history and implementation chronology.

## Put each claim in its authoritative medium

Use the medium that demonstrates the claim most directly:

- Code and schemas define implemented structure and machine-enforced behavior.
- Tests demonstrate consequential behavior and compatibility contracts.
- Generated reference material describes interfaces that can be derived reliably.
- Documentation explains current concepts, supported use, non-obvious constraints, operational procedures, and durable rationale.
- Comments explain non-obvious local intent, constraints, and rationale beside the applicable code.

Treat documentation that repeats an environment lookup as a cache.
Keep that cache only when the lookup is difficult enough for the audience to justify its maintenance cost.
Link to an authority instead of repeating it when the audience can use the authority directly.

## Describe the current system

Describe supported behavior, current concepts, active constraints, and the supported path directly.
Do not narrate the changes that produced the current system.
Remove superseded plans, specifications, task summaries, implementation notes, and obsolete alternatives from current documentation.
Retain past context only when it explains a current constraint, compatibility contract, or decision.
State the current decision first and remove the history when its constraint no longer applies.

Update documentation only when a change alters a supported claim or creates a knowledge gap for a current audience.
Do not document implementation details that code and tests make sufficiently clear.
When a change replaces a claim, update its authority and remove superseded descriptions in the same change.

## Verify documentation

Resolve disagreements from executable evidence and applicable decisions before rewriting prose.
Verify commands and procedures through the supported interface when practical.
Verify links and generated references with the repository's supported checks.
Confirm that comments do not restate code that normal navigation makes clear.

Documentation work is complete when each retained passage serves a current audience and question, each claim has one authority, changed claims match the supported system, obsolete material is removed, and required procedures and checks pass.
