---
name: verification
description: Use whenever work has requirements whose satisfaction should be established or makes claims that should be supported with evidence.
---

# Verification

Requirements define the accepted result.
Implementation creates that result.
Verification establishes justified confidence that the result exists, and review judges whether the result and its evidence are sufficient.
A test is one possible source of evidence, not the default output.

## Project-specific strategy and workflow routing

When the repository contains `VERIFICATION.md`, discover and read it before applying project-specific verification rules.
Treat that file as the source of truth for the repository's accepted project-specific verification strategy.
Read [DESIGN-PORTFOLIO](references/DESIGN-PORTFOLIO.md) only when the user asks to design or reduce maintained verification across a project.
Read [PROJECT-STRATEGY](references/PROJECT-STRATEGY.md) only when considering creation or change of a durable project-wide verification strategy.

## Authority and context

Use requirements to determine the accepted result.
When present, the repository verification strategy owns project-wide evidence constraints.
Executable workflows own mandatory gates; complete each mandatory gate through its owner.
Expose material authority conflicts instead of silently resolving them.

## 1. Understand what must be true

Read the exact work, requirements, and authority, then decide what must be true.
Do not strengthen the guarantee to make checking easier.
Confirm the result and required checks are observable, feasible, and capable.
If no supported observation can establish it, report the unresolved requirement, design, or capability.

Identify supported behavior that should continue to work.
Exact-work evidence checks the current implementation or a transition.
Durable coverage is evidence kept to protect supported behavior that should continue to work.

## 2. Identify a realistic important mistake

Understand the implementation, dependent boundaries, retained evidence, and owning gates.
Identify a plausible important failure and the observation that distinguishes it from the accepted result.
A useful check catches that failure without rejecting a correct implementation.
Treat rejection or recovery as protection only when evidence shows that it prevents, contains, or recovers from the important consequence.

## 3. Use the simplest reliable check

Choose direct supported evidence at the lowest reasonable execution, diagnosis, coupling, and maintenance cost.
Do not keep or add a check merely because it is broader, slower, familiar, or present.
Use the relevant environment and record only procedure, environment, and observation.
Evidence supports only what it observed.
Prefer evidence independent enough from implementation logic under review that a wrong implementation can fail it.
Evidence must cross the real boundary when behavior depends on it.

For a changed integration, run one normal operation through the exact implementation and real dependency, not a test double.
Component or failure checks do not prove normal operation.
If no supported operation can establish the integration, report it unverified.

Complete each mandatory gate through its owner.
Missing, malformed, unavailable, or ambiguous evidence is unknown, not success.
Inability to collect evidence is neither success nor product failure.
Report failed mechanisms and uncertainty.
Do not require plans or standard output unless requested or parsed.

## 4. Decide separately whether the check belongs permanently

Durable coverage protects enduring behavior, not implementation or transition constraints.
Do not require a test by default.
Add automation only when it repeatedly catches a plausible important regression missed by retained or one-time evidence and is worth its cost.

Keep the smallest sufficient set.
Update, reuse, consolidate, or remove checks when that gives sufficient confidence at lower cost.
Remove an affected check that protects no enduring supported behavior when its maintenance cost or coupling is material.
Decide that coverage is justified before choosing its boundary.
Do not broaden a boundary to justify coverage.

Treat retirement and removal as work-specific by default.
A retired concept is not enduring behavior merely because work required its removal or preservation during transition.
Verify retirement and leave-untouched constraints with exact-work evidence without retaining that concept as product knowledge.
Only an independently authorized ongoing compatibility, safety, or security prohibition is an exception.
That prohibition remains enduring, including as an absence; evidence cannot create its authority.
A deliberate hypothetical reintroduction is not a plausible regression.
Do not require historical, mutation, or sensitivity experiments by convention.
Do not retain durable evidence only to prove documentation wording or a retired concept's absence.

After implementation, compare work with the result and evidence.
Report only material confidence gaps and state what remains unsupported.
Distinguish insufficient evidence from a tooling or capability failure that prevents trustworthy review.
