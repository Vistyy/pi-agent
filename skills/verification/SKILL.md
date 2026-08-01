---
name: verification
description: Use when planning, executing, or reviewing verification for a material change; writing a Task Verification Contract; creating or maintaining VERIFICATION.md; or designing a project verification portfolio.
---

# Verification

Require evidence that is proportionate to the plausible and meaningful ways a change can fail.
Do not require a test by default.

## Canonical terms

**Material Risk**: A plausible failure with a meaningful consequence that is supported by accepted requirements or concrete project evidence.
Do not use numerical risk scoring.
Do not invent unsupported requirements or speculative edge cases.

**Verification Claim**: A specific fact that evidence must establish to address a Material Risk.

**Verification Evidence**: An observation or artifact that supports or refutes a Verification Claim.

**Task Verification Contract**: The Task Context section that defines required confidence for one implementation Task.

## Authority

Accepted requirements define required behavior.
Repository instructions define mandatory gates.
The root `VERIFICATION.md` defines accepted project verification strategy.
The Task Verification Contract defines task-specific verification requirements.
Executable code and configuration determine whether a named mechanism exists.

A Task Verification Contract must not weaken accepted requirements, mandatory gates, or accepted project strategy.
When accepted authorities conflict, stop and ask the user to resolve the conflict.
When documentation disagrees with executable availability, correct the stale documentation.

Do not audit every verification source during each invocation.
When current work reveals a material conflict, report the conflict and correct the stale authority before relying on it.
Keep proposed mechanisms outside `VERIFICATION.md` until the user approves them.

## 1. Load the project strategy

Read the applicable domain context and accepted decisions.
If `VERIFICATION.md` exists, read it before selecting evidence.
If `VERIFICATION.md` is missing or needs revision, read [Manage Project Verification Strategy](references/PROJECT-STRATEGY.md).
Inspect only the executable mechanisms and repository instructions relevant to the current work.

This step is complete when the accepted strategy, relevant mechanisms, and mandatory gates are known.

## 2. Define the required confidence

Identify each Material Risk introduced or affected by the work.
For each Material Risk, define the smallest sufficient set of Verification Claims.
A Material Risk does not authorize maximum prevention.
Define the smallest fact that provides sufficient confidence without requiring a stronger product guarantee than accepted requirements justify.
Existing rejection, recovery, or operator control is sufficient when concrete evidence does not show a remaining material consequence.
Do not add product behavior only to eliminate a possibility or simplify verification.
When no proportionate claim can address an accepted Material Risk, expose the product decision instead of inventing or silently weakening a claim.
Use `Not required` only to exclude a likely scope misunderstanding.
Do not enumerate remote possibilities only to reject them.

This step is complete when every Material Risk has sufficient Verification Claims, every Verification Claim addresses a Material Risk, and no claim requires an unjustified product guarantee.

## 3. Apply the applicable workflow

- When creating or revising a Task, read [Plan a Task](references/PLAN-TASK.md).
- When implementing an approved Task Verification Contract, read [Execute a Task Verification Contract](references/EXECUTE-CONTRACT.md).
- When reviewing completed work or submitted evidence, read [Review Verification Evidence](references/REVIEW-EVIDENCE.md).
- When creating or redesigning the project portfolio, read [Design a Verification Portfolio](references/DESIGN-PORTFOLIO.md).
- When selecting evidence or resolving an unfamiliar technique, read [Verification Techniques](references/TECHNIQUES.md).

This step is complete when the applicable workflow reaches its completion criterion.
