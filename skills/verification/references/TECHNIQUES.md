# Verification Techniques

Verification techniques are an open set.
The examples in this reference illustrate credible evidence forms but do not limit which mechanism an agent may select.

## Terms

**Distinct Regression Failure**: A plausible regression that other selected or retained Verification Evidence would not reveal.
A different input, fixture, branch, assertion, or code path does not make a failure distinct by itself.

**Lifecycle Cost**: The total cost of Verification Evidence across authoring, review, code and fixtures, execution time and resources, stability, failure diagnosis, coupling, and future maintenance, compared with the least-cost feasible Evidence that establishes the same Claim.

## Select evidence

Use integration or end-to-end evidence only when interaction across a Required Seam is part of the Claim.
Do not use test count or coverage percentage as a substitute for a Verification Claim.
Do not preserve an existing test, category, seam, or integration level only because it already exists.

Evidence can include type checking, static analysis, focused commands, tests, inspection, rendered behavior, logs, traces, reproducible procedures, measurements, experiments, and mandatory gates.
For example:

- A type or API Claim can use type checking or static analysis.
- A local behavioral Claim can use focused execution or a narrow automated test.
- A cross-component Claim can use focused integration evidence at the boundary that owns the interaction.
- A Claim that requires the complete system path can use end-to-end evidence while lower-cost seams cover variations.
- A visual or interaction Claim can use rendered inspection or a representative browser procedure.
- An operational or configuration Claim can use a real command and resulting state inspection.
- A performance Claim can use measurement against an explicit budget.
- A removal Claim can use one-time diff, search, and inspection evidence.

Evidence produced with a test double establishes behavior against that test double.
It does not establish integration with the real dependency.
Use test-double evidence only when the Verification Claim does not require real integration evidence.

## Admit a durable automated test

Compare Lifecycle Cost with the least-cost feasible Evidence that can establish the Claim.
Do not use a numerical score or test-to-production line ratio to replace judgment about confidence and cost.

Require a new or changed durable test only when all applicable conditions are true:

- It protects accepted supported behavior, an interface, an invariant, or a reproduced defect class.
- It detects a Distinct Regression Failure supported by accepted requirements or concrete evidence.
- Existing retained Evidence and proportionate one-time Evidence do not establish the Claim sufficiently.
- The selected seam observes the Claim reliably.
- The additional coverage justifies its additional Lifecycle Cost over the least-cost feasible alternative.

Before requiring durable automation, state the Distinct Regression Failure, why existing or one-time Evidence is insufficient, and why the Lifecycle Cost is proportionate.
Apply these conditions to every added or changed test case, including each parameterized case.
Map each test case to its Distinct Regression Failure.
A parameterized test can use one table or matrix when that mapping remains explicit.
Remove or consolidate a test case that does not satisfy these conditions.
Do not translate each accepted-behavior statement or evidence example into a test.

When execution or resource cost is a Material Risk or an accepted budget applies, measure the focused mechanism and its effect on the maintained workflow.

When a test is retained as regression evidence for a reproduced defect, demonstrate that it fails against the defective behavior when the pre-fix revision can run the same test and inputs in the supported environment.
For a test other than a reproduced-defect regression test, require sensitivity evidence only when an approved verification plan identifies a specific way the test could pass while the claimed failure remains.
Do not use temporary source mutation as a routine sensitivity technique.
Use a controlled mutation experiment only when the accepted Claim requires that sensitivity evidence.

## Resolve an unsupported technique

Inspect existing project tools and patterns relevant to the Verification Claim.
Research foundational library capabilities when a library may supply the mechanism.
When an experiment can resolve consequential uncertainty, obtain approval from the applicable authority and run the smallest real-system experiment.
Obtain approval before adding a dependency, changing an accepted project mechanism, or relying on a capability unavailable in the supported environment.
If approval or capability is unavailable, stop the affected work or amend its approved plan.
Do not weaken the Verification Claim silently.

Technique selection is complete when each mechanism can establish its Verification Claim at justified Lifecycle Cost and each consequential unknown has an explicit resolution path.
