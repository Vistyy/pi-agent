# Design a Verification Portfolio

Use this reference only when the user explicitly asks to design, reduce, or substantially reorganize maintained verification across a project.
Routine implementation verification does not require a portfolio design.

Start from supported behavior and the consequential failures the project needs to detect, not from the current test inventory or a target coverage number.
Inspect the current evidence before proposing additions or removals.
Retain the smallest coherent set that gives justified confidence across the supported system.
One mechanism may establish confidence in several behaviors, and one behavior does not require one dedicated test.

Remove or consolidate evidence when the remaining portfolio still detects the meaningful failures it was protecting against.
Add evidence only for a material confidence gap that the retained portfolio does not address sufficiently.
Consider execution time, stability, diagnosis, coupling, and maintenance as part of portfolio quality.

Do not require a risk matrix, claim inventory, complete test mapping, or standard proposal format.
Present the consequential additions, removals, retained protections, and trade-offs in the clearest form for the decision.
Record a durable project decision only through the project's applicable authority.
