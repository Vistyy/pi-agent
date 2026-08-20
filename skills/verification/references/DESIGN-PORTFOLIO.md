# Design a Verification Portfolio

## Establish the intended protection

Identify the supported behavior and consequential failures that the maintained portfolio should protect against.
Start from the supported system rather than the current test inventory or a target coverage number.
Do not turn every behavior or possible failure into a separate test requirement.

This activity has enough direction when the intended protection and any accepted runtime, stability, or maintenance constraints are clear.

## Inspect the current portfolio

Inspect the relevant tests, checks, static mechanisms, and other retained evidence.
Determine which protections they provide, where meaningful confidence gaps remain, and where mechanisms are redundant, unstable, disproportionately expensive, or difficult to diagnose.
One mechanism may protect several behaviors, and one behavior does not require one dedicated test.

Treat the current portfolio as evidence about past decisions, not as authority that every mechanism must remain.

## Propose the portfolio change

Retain the smallest coherent set that gives justified confidence across the supported system.
Remove or consolidate evidence when the remaining portfolio still detects the meaningful failures it protected against.
Add evidence only for a material confidence gap that the retained portfolio does not address sufficiently.
Consider execution time, stability, diagnosis, coupling, and maintenance as part of portfolio quality.

Do not require a risk matrix, an inventory of supported behavior, complete test mapping, or standard proposal format.
Present the consequential additions, removals, retained protections, and trade-offs in the clearest form for the decision.
