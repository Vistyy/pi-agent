---
name: improve-codebase
description: "[M] Inspect one bounded part of a codebase deeply and recommend an evidence-backed path to materially simplify its structure."
disable-model-invocation: true
---

# Improve Codebase

Inspect one bounded part of the current codebase deeply enough to understand how its implementation, ownership, interfaces, state, callers, and verification compose.
Recommend a coherent simpler destination and an ordered path that removes the supported structural cause of current maintenance cost.
This skill produces a recommendation.
Do not modify code or work records unless the user explicitly requests implementation.
Deletion and no structural change are valid outcomes.

## 1. Select one bounded lens

If the user names a behavior, flow, module, subsystem, or recurring problem, use it as the initial lens.
Otherwise, inspect the codebase broadly only until current evidence identifies one bounded area with a consequential structural question, then investigate that area deeply.
Discover and follow the repository's applicable instructions, accepted decisions, domain terms, and supported work-recording mechanism.
State the current behavior and requirements that a simplification must preserve.
Do not treat the current structure, a proposed future capability, or a familiar design pattern as a requirement.

Bound the investigation by the behavior and relationships that must be understood, not by a target file count or edit size.
Follow relationships outside the initial area when they materially affect ownership, caller knowledge, runtime flow, state, or verification.
Do not widen to a repository-wide redesign unless concrete evidence shows that the same structural cause crosses those boundaries.

This step is complete when the selected lens, preserved behavior, and evidence-supported investigation boundary are explicit.

## 2. Reconstruct the relevant design

Apply the `codebase-design` skill to reconstruct the current structure and compare candidate destinations.
Trace one representative behavior or maintenance workflow through its complete relevant path, including the callers, owned behavior, state or external boundaries, and verification that materially affect it.
Trace another path only when a material difference prevents the first path from establishing the aggregate structure or cost.
Inspect enough current implementation, callers, tests, checks, and configuration to explain why each participating boundary exists and what its callers must know or coordinate.
Use the smallest representation that makes those relationships inspectable.

Use repository history when it can explain why the structure exists or establish recurring maintenance work.
Do not require historical defects when the current implementation and its actual callers directly establish distributed knowledge, duplicated coordination, or verification burden.

This step is complete when the complete relevant path and the contribution of each structural boundary can be explained without relying on its names alone.

## 3. Diagnose compounding structural cost

Evaluate how the complete path composes rather than judging each module in isolation.
Use the following as investigation leads rather than required findings:

- pass-through layers that expose the next layer's knowledge;
- rules or lifecycles split among owners and coordinated by callers;
- duplicated or repeatedly translated identities, states, errors, or configuration;
- verification that reconstructs implementation layering instead of observing supported behavior; and
- temporary, compatibility, or custom machinery that no current boundary requires.

For every retained problem, name its present maintenance consequence and cite the implementation, callers, tests, changes, failures, or commands that establish it.
A current structural relationship is sufficient evidence when it demonstrably distributes knowledge, coordination, edit locations, or verification setup across the selected behavior.
A hypothetical future edit or generic design preference is not sufficient evidence.

Do not stop at the first safe local cleanup.
Treat incidental naming, formatting, and isolated duplication as context unless changing them materially simplifies the selected design.
Trace related symptoms to their shared structural cause when the evidence supports one.
If no material structural cause is supported, report that no structural recommendation was found within the inspected lens instead of substituting a minute improvement.

This step is complete when named evidence supports the structural cause and its aggregate maintenance consequence.

## 4. Check known work and accepted constraints

Search the repository's authoritative Tasks, issues, plans, roadmaps, or equivalent records by affected behavior, structural cause, and intended outcome.
When an existing record owns the complete simplification, report that record instead of creating a duplicate recommendation.
When it owns only part, continue only with a distinct residual problem supported by its own evidence.
Defer a recommendation when active work is expected to invalidate its evidence or materially change its boundary, unless a distinct residual cost remains independently supported.

Check accepted decisions and explanations for intentional boundaries or trade-offs.
Preserve an accepted constraint unless material current evidence justifies asking the applicable authority to reconsider it.
If an unavailable authoritative source is necessary to establish novelty or a constraint, report that limitation instead of claiming an untracked recommendation.

This step is complete when the recommendation's relationship to known work and accepted constraints is explicit.

## 5. Define the simpler destination

Use the `codebase-design` comparison, deletion, ownership, and interface criteria to compare only the structures supported by the diagnosed cause.
Evaluate each candidate across the complete relevant path rather than accepting locally simple modules whose composition increases aggregate knowledge or coordination.
Choose the simplest coherent destination that preserves current requirements and materially removes or concentrates the diagnosed burden.
Minimize machinery in the destination, but do not minimize the recommendation to the smallest diff when that leaves the structural cause in place.
Do not retain optional layers or flexibility for unsupported future possibilities.

When a consequential unknown prevents a trustworthy destination, name the exact evidence needed to resolve it instead of filling the gap with conventional architecture.
If the current structure remains the simplest supported design, recommend no structural change and explain why.

This step is complete when the destination, its ownership, its representative caller, and its improvement over the complete current path are explicit.

## 6. Design the uncoupling path

Describe an ordered path from the current structure to the simpler destination.
Use one direct change when it is safer and clearer than staging.
When stages are required, each stage must preserve supported behavior and either produce an observable simplification or be necessary for a named later removal.
Do not split stages merely by file, layer, implementation activity, or estimated effort.

For every temporary Adapter, representation, compatibility path, or duplicate flow, identify why it is necessary, which later stage removes it, and how that removal is verified.
Do not present preparatory machinery as the completed improvement.
Select a first step that changes the diagnosed causal structure rather than performing unrelated cleanup.
State the caller migration, obsolete-path deletion, and verification needed to prevent the old and new structures from becoming permanent parallel systems.

This step is complete when the user can see both the coherent destination and how every stage advances toward its completed simplification.

## 7. Present the result

Return concise prose under these headings in this order:

1. `Lens and current structure`
2. `Compounding cost`
3. `Simplified destination`
4. `Stepwise path`
5. `Evidence, known work, and constraints`
6. `Cost, risk, and verification`

Distinguish verified facts, supported inferences, and decision-blocking unknowns.
Name the relevant files, callers, work records, and accepted decisions.
Present multiple destinations only when evidence leaves a genuine structural decision unresolved.
Do not pad the result with unrelated local improvements.

The review is complete when the user can judge a materially simpler coherent destination and its removal path without reconstructing the investigation, or when the evidence supports no structural change within the selected lens.
