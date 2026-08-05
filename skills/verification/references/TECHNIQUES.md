# Verification Techniques

Verification techniques are an open set.
The examples in this reference illustrate credible evidence forms but do not limit which mechanism an agent may select.

## Select evidence

Use the least costly supported seam that establishes the complete Verification Claim reliably.
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

Lifecycle cost includes authoring and review, code and fixture size, execution time and resources, stability, failure diagnosis, coupling, and future maintenance.
Do not use a numerical score or test-to-production line ratio to replace judgment about confidence and cost.

Require a new or changed durable test or coherent test group only when all applicable conditions are true:

- It protects accepted supported behavior, an interface, an invariant, or a reproduced defect class.
- It detects a distinct plausible regression failure supported by accepted requirements or concrete evidence.
- Existing retained evidence and proportionate one-time evidence do not establish the Claim sufficiently.
- The selected seam observes the Claim reliably.
- The distinct confidence gained justifies the lifecycle cost.

Before requiring durable automation, state the distinct regression failure, why existing or one-time evidence is insufficient, and why the lifecycle cost is proportionate.
For each additional durable case, identify the materially distinct failure that retained evidence would otherwise miss.
Consolidate or omit cases that add no distinct failure, especially when they repeat the same Claim through an equally or more expensive seam.
Do not translate each accepted-behavior statement or evidence example into a test.

Do not retain a test only to prove that an edit occurred.
Use search, diff review, type checking, or a one-time script for retired text, symbols, files, or implementation structure.
When execution or resource cost is a Material Risk or an accepted budget applies, measure the focused mechanism and its effect on the maintained workflow.

When a test is retained as regression evidence for a reproduced defect, demonstrate that it fails against the defective behavior when practical.
This demonstration may use the pre-fix revision after implementation.
For a test other than a reproduced-defect regression test, require sensitivity evidence only when an approved verification plan identifies a concrete false-confidence risk.
Do not use temporary source mutation as a routine sensitivity technique.
Use a controlled mutation experiment only when the required confidence specifically justifies it.

## Resolve an unsupported technique

Inspect existing project tools and patterns relevant to the Verification Claim.
Research foundational library capabilities when a library may supply the mechanism.
When an experiment can resolve consequential uncertainty, obtain approval from the applicable authority and run the smallest real-system experiment.
Obtain approval before adding a dependency, changing an accepted project mechanism, or relying on a capability unavailable in the supported environment.
If approval or capability is unavailable, stop the affected work or amend its approved plan.
Do not weaken the Verification Claim silently.

Technique selection is complete when each mechanism can establish its Verification Claim at justified lifecycle cost and each consequential unknown has an explicit resolution path.
