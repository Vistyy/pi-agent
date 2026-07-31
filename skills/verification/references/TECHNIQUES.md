# Verification Techniques

## Select evidence

Prefer the least costly mechanism that establishes a Verification Claim reliably.
Use the closest public seam that observes the complete claim.
Use an end-to-end seam only when the integration is part of the claim.
Use evidence that is independent from the implementation logic under review.
Do not use test count or coverage percentage as a substitute for a Verification Claim.

Evidence can include type checking, static analysis, focused commands, tests, inspection, rendered behavior, logs, traces, reproducible procedures, measurements, experiments, and mandatory gates.
The Verification Claim determines the mechanism.

## Admit a durable automated test

Require a new or changed durable test only when all applicable conditions are true:

- The test protects supported behavior, a public interface, an invariant, or a reproduced defect class.
- The behavior is likely to regress without maintained automation.
- The selected seam observes the claim reliably.
- The confidence gained justifies execution and maintenance cost.
- Existing evidence does not establish the claim sufficiently.

Do not retain a test only to prove that an edit occurred.
Use search, diff review, type checking, or a one-time script for retired text, symbols, files, or implementation structure.
Before adding a test to a slow suite, measure its focused runtime and effect on maintained suite runtime.
Do not increase a shared timeout to accommodate one slow test.

Evidence produced with a test double establishes behavior against that test double.
It does not establish integration with the real dependency.
Use test-double evidence only when the Verification Claim does not require real integration evidence.

When a test is retained as regression evidence for a reproduced defect, demonstrate that it fails against the defective behavior when practical.
This demonstration may use the pre-fix revision after implementation.
For another test, require sensitivity evidence only when the Task Verification Contract identifies a concrete false-confidence risk.
Do not use temporary source mutation as a routine sensitivity technique.
Use a controlled mutation experiment only when the required confidence specifically justifies it.

## Resolve an unsupported technique

Inspect existing project tools and patterns relevant to the Verification Claim.
Research foundational library capabilities when a library may supply the mechanism.
When an experiment can resolve consequential uncertainty, obtain user approval and run the smallest real-system experiment.
Ask the user or planner to approve a new mechanism before depending on it.
If approval or capability is unavailable, block the Task or amend the plan.
Do not weaken the Verification Claim silently.

Technique selection is complete when each mechanism can establish its Verification Claim at justified cost and each consequential unknown has an explicit resolution path.
