---
name: improve-codebase-architecture
description: "[M] Review codebase architecture, present deepening candidates in a visual report, and develop one selected design."
disable-model-invocation: true
---

# Improve Codebase Architecture

Identify shallow modules that reduce testability or require callers to understand distributed behavior.
Propose deepening changes that move behavior behind smaller interfaces.

Before you start, use the `codebase-design` skill.
Use its architecture vocabulary and principles for every architectural claim.
Use `CONTEXT-MAP.md` to select the applicable context when the map exists.
Otherwise, use the root `CONTEXT.md` when it exists.
Use the applicable domain terms and treat the applicable ADRs as current constraints.

## 1. Explore the repository

Select the target area before scanning the codebase.
If the user names a module, subsystem, or problem, use that target.
Otherwise, inspect a representative range of recent commits with `git log --oneline`.
Give priority to files and areas that change repeatedly.
If recent changes have no concentration, widen the scan.

Read the applicable `CONTEXT.md` and ADRs for the target area.

Use `fork` when the target spans multiple directories, ownership is unclear, or several domain concepts are involved.
Inspect directly when the user names one module, file, or seam.

Look for these observable signals:

- Understanding one domain concept requires reading many small modules.
- A module's interface exposes nearly as much complexity as its implementation.
- Tests target extracted functions while defects occur in caller coordination.
- Coupled modules expose implementation knowledge across their seams.
- Existing interfaces cannot support tests for important behavior.

Apply the **deletion test** to each suspected shallow module.
Record whether deleting the module removes only pass-through structure or distributes hidden behavior among callers.
A cluster is a deepening candidate when its pass-through modules can be replaced by one deeper interface.
If deleting a module distributes its hidden behavior among callers, record that the module already provides locality.
Do not select that module from the deletion-test result alone.

Exploration is complete when you have three credible candidates or evidence that fewer exist.
For each candidate, record:

- Involved files.
- The shallow interface.
- The implementation complexity exposed to callers.
- The deletion-test result.

## 2. Present candidates

Use the `lavish` skill before writing the report.
Create `.lavish/reviews/architecture-review-<timestamp>.html` with [HTML-REPORT.md](HTML-REPORT.md).
Include every credible candidate, its before and after diagrams, and one top recommendation.
Run Lavish review until no layout warning remains.

Use terms from the applicable `CONTEXT.md` for domain concepts.
Use `codebase-design` terms for architecture.
For example, use `Order intake module` instead of an implementation class name or `Order service`.

If a candidate conflicts with an ADR, include it only when observed friction justifies reconsidering the ADR.
Mark the conflict in the candidate card and name the ADR.

Use [HTML-REPORT.md](HTML-REPORT.md) for report structure and diagram guidance.
Present candidates before proposing interfaces.
After the report is ready, ask which candidate the user wants to explore.

## 3. Develop the selected candidate

After the user selects a candidate, use the `grilling` skill.
Resolve:

- Constraints and dependencies.
- The deepened module name.
- Its interface.
- Behavior hidden in its implementation.
- Required adapters.
- Tests that remain or change.

Use the `domain-modeling` skill when the discussion changes the domain model:

- Add a resolved module term to the applicable `CONTEXT.md` when the term identifies a domain concept.
- Update the applicable `CONTEXT.md` immediately after resolving an existing ambiguous term.
- Offer an ADR when rejecting the candidate establishes a difficult, surprising, trade-off decision.
- Use the design-it-twice process from `codebase-design` when the user requests alternative interfaces.

The process is complete when the selected candidate has a named deep module and proposed interface.
Its hidden implementation, adapters, and surviving tests must be explicit.
Complete or explicitly decline each required domain and ADR update.
