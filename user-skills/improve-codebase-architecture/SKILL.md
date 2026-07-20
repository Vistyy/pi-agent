---
name: improve-codebase-architecture
description: "[M] Review codebase architecture, present deepening candidates in a visual report, and develop one selected design."
disable-model-invocation: true
---

# Improve Codebase Architecture

Identify shallow modules that reduce testability or expose distributed behavior to callers.
Propose deeper interfaces that hide that behavior.

Before starting, use the `codebase-design` skill.
Use its architecture vocabulary and principles for every architectural claim.
If `CONTEXT-MAP.md` exists, use it to select the applicable context.
Otherwise, if the root `CONTEXT.md` exists, use the root context.
Use applicable domain terms.
Treat applicable ADRs as current constraints.

## 1. Explore the repository

Select the target area before scanning.
If the user names a module, subsystem, or problem, use that target.
Otherwise, inspect representative recent commits with `git log --oneline`.
Prioritize repeatedly changed files and areas.
If recent changes show no concentration, widen the scan.

Read the target area's applicable `CONTEXT.md` and ADRs.

If the target spans multiple directories, use `fork`.
If ownership is unclear, use `fork`.
If several domain concepts are involved, use `fork`.
If the user names one module, file, or seam, inspect it directly.

Look for these observable signals:

- One domain concept spans many small modules.
- An interface exposes nearly as much complexity as its implementation.
- Tests target extracted functions, while defects occur in caller coordination.
- Coupled modules expose implementation knowledge across their seams.
- Interfaces cannot support tests for important behavior.

Apply the **deletion test** to each suspected shallow module.
Record whether deletion removes pass-through structure or distributes hidden behavior among callers.
If pass-through modules can be replaced by one deeper interface, treat the cluster as a candidate.
If deletion distributes hidden behavior, record that the module provides locality.
Use more than the deletion-test result to select a module.

Exploration is complete when you have three credible candidates or evidence that fewer exist.
For each candidate, record its files, shallow interface, exposed implementation complexity, and deletion-test result.

## 2. Present candidates

Before writing the report, use the `lavish` skill.
Create `.lavish/reviews/architecture-review-<timestamp>.html` according to [HTML-REPORT.md](HTML-REPORT.md).
Include every credible candidate.
Include before and after diagrams.
Identify one top recommendation.
Run Lavish review until no layout warning remains.

Use applicable `CONTEXT.md` terms for domain concepts.
Use `codebase-design` terms for architecture.
For example, use `Order intake module` instead of an implementation class name or `Order service`.

If a candidate conflicts with an ADR, require observed friction before including the candidate.
Mark the conflict in the candidate card.
Name the ADR.

Present candidates before proposing interfaces.
After the report is ready, ask which candidate the user wants to explore.

## 3. Develop the selected candidate

After the user selects a candidate, use the `grilling` skill.
Resolve:

- Constraints and dependencies.
- The deepened module name and interface.
- Hidden implementation behavior.
- Required adapters.
- Surviving or changed tests.

If the discussion changes the domain model, use the `domain-modeling` skill.
If a resolved module term identifies a domain concept, add it to the applicable `CONTEXT.md`.
After resolving an ambiguous term, update the applicable `CONTEXT.md` immediately.
If rejecting the candidate establishes a difficult or surprising trade-off decision, offer an ADR.
If the user requests alternative interfaces, use the design-it-twice process from `codebase-design`.

The process is complete when the selected candidate has a named deep module and proposed interface.
Its hidden implementation, adapters, and surviving tests must be explicit.
Complete or explicitly decline each required domain and ADR update.
