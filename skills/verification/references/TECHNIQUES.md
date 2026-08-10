# Verification Techniques

Use this reference when choosing evidence is consequential or unfamiliar, or when durable automation is under consideration.
This is reasoning guidance, not a catalog of required mechanisms.

## Evaluate evidence

Evidence should observe the behavior closely enough to distinguish the meaningful incorrect result from the accepted result.
It should be sufficiently independent from the implementation logic under review, correspond to the exact work and relevant environment, and produce an interpretable observation.
A broader execution path is useful only when the behavior being established depends on that path.
A test double establishes behavior against the double, not integration with the real dependency.
Unavailable, malformed, or ambiguous output leaves the result unknown.

When more than one mechanism is credible, prefer the reliable one with lower execution, diagnosis, coupling, and maintenance cost.
Do not preserve a mechanism merely because it already exists or appears stronger by being broader.
If no proportionate supported mechanism can establish a required result, expose the limitation instead of adding machinery or weakening the result silently.

## Consider durable automation

Durable automation is valuable when it can repeatedly reveal a plausible meaningful regression that other retained or proportionate one-time evidence would miss.
Its value must justify the cost of authoring, execution, diagnosis, coupling, and maintenance.
A different input, branch, fixture, assertion, or changed line does not by itself identify a distinct regression worth another test.
Prefer updating, reusing, consolidating, or removing existing coverage when that gives sufficient confidence at lower cost.

A reproduced-defect test is stronger when it demonstrably fails against the defective behavior, but do not require mutation or historical execution when the cost or environment does not justify it.
Do not add sensitivity experiments by convention.

## Produce interpretable evidence

Record only the command or procedure, relevant environment, and observation needed to understand the result.
Use the owning workflow for mandatory gates instead of duplicating them manually.
A failed evidence mechanism does not establish that the work is wrong, but it also does not establish that the work is correct.
Report the failed mechanism and the remaining uncertainty.
