---
name: vertical-slices
description: Vertical slices for implementation planning. Use when decomposing a specification into tasks, checking whether a task is a thin tracer bullet, or discovery expands work into a shared contract, lifecycle change, or independent capability.
---

# Vertical Slices

A **tracer bullet** is one thin end-to-end path that delivers a narrow capability through every relevant integration layer.
Product coherence does not make several capabilities one implementation task.

## 1. Define the behavior

Identify:

- The one observable capability the task delivers.
- The highest practical verification seam through which that capability is demonstrated.
- The required observable behaviors it owns and their source requirements.
- Its explicit acceptance criteria.
- Its prerequisites and blocking tasks.

Completion criterion: the capability, verification seam, owned behaviors, acceptance criteria, and blockers are explicit.

## 2. Apply the vertical slice rules

A vertical slice:

- Delivers one narrow but complete capability.
- Cuts through every relevant layer rather than completing one horizontal layer for several capabilities.
- Is independently demonstrable or verifiable through its primary seam.
- Starts from a green prerequisite state and can return the repository to green before dependent work begins.
- Contains no undeclared shared contract, lifecycle change, migration stage, or independent capability.

A slice may contain multiple commits and local implementation details.
File count does not determine its size.
One verification seam does not combine several independent capabilities into one slice.

Completion criterion: repository evidence confirms every vertical slice rule.

## 3. Produce flat tasks

When proposed work contains several vertical slices, replace it with flat tasks that each link directly to the source specification.
Express ordering through `Blocked by` relationships.
Decompose broad requirements and user stories into observable behaviors.
Assign each behavior to exactly one owning task, while allowing one user story to span several tasks.
Create a shared integration task only when the integration has independent observable behavior.

Completion criterion: every required observable behavior has one task owner, every dependency is explicit, and every task passes the vertical slice rules.

## 4. Sequence wide refactors

A **wide refactor** is one mechanical change whose blast radius prevents a vertical slice from landing green.
Use **expand-contract**:

1. **Expand** by adding the new form beside the old form while existing callers continue to work.
2. **Migrate** callers in independently green batches, with each batch represented by a flat task blocked by the expand task.
3. **Contract** by removing the old form after every caller has migrated.

When a migration batch cannot stay green independently, use an integration branch and make the affected batches block one final integrate-and-verify task.

Completion criterion: every stage has an explicit green-state promise, all migrations block contraction, and contraction removes the replaced path.

## 5. Guard the slice during implementation

Return to these rules whenever discovery expands the planned work.
A non-independent local detail required for the same capability remains in the task.
When repository evidence reveals an undeclared prerequisite that must complete before the current task can succeed, stop before continuing.
Report the evidence, why the prerequisite is a separate vertical slice, the proposed flat task, and why it blocks the current task, then wait for user approval.
Work that is not required for the current capability remains outside the task.

Completion criterion: implementation proceeds only while every required prerequisite is declared and complete, and every planned change belongs to the current vertical slice.
