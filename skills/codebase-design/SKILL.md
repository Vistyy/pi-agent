---
name: codebase-design
description: Use when deciding where behavior belongs, changing what callers must know, placing or removing a seam, or defining a module's test surface.
---

# Codebase Design

Select the simplest structure that makes ownership and coordination explicit, keeps caller knowledge small, and makes important behavior easy to verify.
A deep module is one possible structure, not the default result.

## Canonical vocabulary

Use the following terms only with these meanings.

**Module**: Anything with an interface and an implementation, including a function, class, package, or tier-spanning slice.
Use **Module** instead of *unit*, *component*, or *service*.

**Interface**: Everything a caller must know to use a module correctly.
The interface includes entry points, invariants, ordering constraints, error modes, configuration, and performance characteristics.
Use **Interface** instead of *API* or *signature*.

**Implementation**: Code inside a module.
When describing a role at a seam, use **Adapter**.
When describing code inside the module, use **Implementation**.

**Seam**: A location where behavior can change without editing that location.
A module exposes its interface at a seam.
Use **Seam** instead of *boundary*.

**Adapter**: An implementation that satisfies an interface at a seam.
The term describes the role, not the code shape.

**Locality**: The concentration of behavior, knowledge, defects, and verification in one module.
Locality lets maintainers make and verify a change in one place.

## 1. Identify the structural problem

Name the behavior, rule, or dependency under consideration.
Name its current owner and every caller that must understand or coordinate it.
Record the interface knowledge that each caller needs, including invariants, ordering, errors, configuration, and performance constraints.
Use observed changes, defects, or test friction when available.

This step is complete when the exact ownership, caller knowledge, or coordination cost is explicit.
If no structural problem remains, keep the current structure.

## 2. Compare the credible structures

Apply the **deletion test** to each relevant module.
If deleting a module removes complexity, prefer deletion or direct code.
If deleting a module distributes knowledge or behavior among callers, the module provides locality.

Compare only structures supported by the problem:

- Keep the current structure.
- Delete or merge pass-through modules.
- Move behavior to its clear owner.
- Keep simple behavior direct at the caller.
- Deepen a module around distributed behavior or knowledge.

Compare each credible structure by caller knowledge, edit locations, new concepts, interfaces, indirection, migration work, and test setup.

This step is complete when named evidence supports one structure and its structural and maintenance trade-offs are explicit.

## 3. Define ownership and interfaces

State which modules or callers own each rule and where coordination is intentional.
Use an interface only when it reduces the knowledge or coordination that callers must carry.
State the interface behavior, invariants, ordering constraints, errors, configuration, and relevant performance characteristics.

Create a seam only when a concrete variation, ownership difference, lifecycle difference, isolation need, or test replacement justifies its interface and indirection.
When a dependency must vary at a seam, accept an adapter instead of constructing the dependency inside the module.
Keep implementation-only seams private.
Tests must use the supported interface for externally observable behavior.

This step is complete when callers can use the interface without implementation knowledge and every seam has a named justification.

## 4. Verify the design

For a proposed design, show one representative caller and the tests that verify the interface.
State the migration and removal work required by the proposal.

A proposed design is complete when named evidence supports simpler caller reasoning and the verification and migration paths are explicit.

For an implemented design, update callers and tests through the supported interface.
Remove the replaced structural path after its callers and tests migrate.
Run the applicable repository checks.

An implemented design is complete when the required behavior is verified and no replaced path remains.

## Conditional guidance

When deepening is the selected structure, read [DEEPENING.md](DEEPENING.md) before defining dependency seams, adapters, or test migration.
When the user requests independent alternative interfaces or structural designs, read [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md).
