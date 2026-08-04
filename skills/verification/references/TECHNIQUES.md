# Verification Techniques

Verification techniques are an open set.
The examples in this reference illustrate credible evidence forms but do not limit which mechanism an agent may select.

## Select evidence

Prefer the least costly mechanism that establishes a Verification Claim reliably.
Use the closest public seam that observes the complete claim.
Use integration or end-to-end evidence only when interaction across that boundary is part of the Claim.
Use evidence that is independent from the implementation logic under review.
Do not use test count or coverage percentage as a substitute for a Verification Claim.
Do not preserve an existing test, category, seam, or integration level only because it already exists.

Evidence can include type checking, static analysis, focused commands, tests, inspection, rendered behavior, logs, traces, reproducible procedures, measurements, experiments, and mandatory gates.
For example:

- A type or API Claim can use type checking or static analysis.
- A local behavioral Claim can use focused execution or a narrow automated test.
- A cross-component Claim can use focused integration evidence at the boundary that owns the interaction.
- A critical system-path Claim can use a small end-to-end sentinel while lower-cost seams cover variations.
- A visual or interaction Claim can use rendered inspection or a representative browser procedure.
- An operational or configuration Claim can use a real command and resulting state inspection.
- A performance Claim can use measurement against an explicit budget.
- A removal Claim can use one-time diff, search, and inspection evidence.

Evidence produced with a test double establishes behavior against that test double.
It does not establish integration with the real dependency.
Use test-double evidence only when the Verification Claim does not require real integration evidence.

## Admit a durable automated test

Require a new or changed durable test only when all applicable conditions are true:

- The test protects supported behavior, a public interface, an invariant, or a reproduced defect class.
- The behavior is likely to regress without maintained automation.
- The selected seam observes the Claim reliably.
- The confidence gained justifies execution and maintenance cost.
- Existing evidence does not establish the Claim sufficiently.

Do not retain a test only to prove that an edit occurred.
Use search, diff review, type checking, or a one-time script for retired text, symbols, files, or implementation structure.
Before adding a test to a slow suite, measure its focused runtime and effect on maintained suite runtime.
Do not increase a shared timeout to accommodate one slow test.

When a test is retained as regression evidence for a reproduced defect, demonstrate that it fails against the defective behavior when practical.
This demonstration may use the pre-fix revision after implementation.
For a test other than a reproduced-defect regression test, require sensitivity evidence only when an approved verification plan identifies a concrete false-confidence risk.
Do not use temporary source mutation as a routine sensitivity technique.
Use a controlled mutation experiment only when the required confidence specifically justifies it.

## Resolve an unsupported technique

Inspect existing project tools and patterns relevant to the Verification Claim.
Research foundational library capabilities when a library may supply the mechanism.
When an experiment can resolve consequential uncertainty, obtain approval from the applicable authority and run the smallest real-system experiment.
Ask the applicable authority to approve a new mechanism before depending on it.
If approval or capability is unavailable, stop the affected work or amend its approved plan.
Do not weaken the Verification Claim silently.

Technique selection is complete when each mechanism can establish its Verification Claim at justified cost and each consequential unknown has an explicit resolution path.
