---
name: verification
description: Use when evidence is needed to determine whether work satisfies its requirements.
---

# Verification

Design, produce, and review evidence that is proportionate to the plausible and meaningful ways work can fail to satisfy its requirements.
Do not require a test by default.

## Canonical terms

**Material Risk**: A plausible failure with a meaningful consequence that is supported by accepted requirements or concrete evidence.
Do not use numerical risk scoring.
Do not invent unsupported requirements or speculative edge cases.

**Verification Claim**: A specific fact that evidence must establish to address a Material Risk.

**Verification Evidence**: An interpretable observation or artifact that supports or refutes a Verification Claim.

## Authority

Accepted requirements define the required result.
Applicable instructions, approved plans, and project strategy define verification constraints and mandatory gates.
Executable behavior and configuration determine whether a named mechanism exists.

Verification must not weaken accepted requirements, mandatory gates, or accepted project strategy.
When accepted authorities conflict, stop and ask the applicable authority to resolve the conflict.
When documentation disagrees with executable availability, correct the stale documentation before relying on it.
Do not add product behavior only to make verification easier.

Do not audit every verification source during each invocation.
Inspect only the authorities and mechanisms relevant to the current work.
Keep proposed project-wide mechanisms outside the accepted project strategy until the applicable authority approves them.

## 1. Discover the verification context

Read the applicable requirements, instructions, context, accepted decisions, approved verification plans, and project verification strategy when they exist.
Inspect the executable mechanisms relevant to the work.
When project verification strategy is missing or needs revision, read [Manage Project Verification Strategy](references/PROJECT-STRATEGY.md).

This step is complete when the required result, accepted verification constraints, relevant mechanisms, and mandatory gates are known.

## 2. Design proportionate evidence

When creating or redesigning a project verification portfolio, read [Design a Verification Portfolio](references/DESIGN-PORTFOLIO.md) and follow that workflow instead of this work-level design step.
Before selecting evidence for current work, read [Verification Techniques](references/TECHNIQUES.md).

Identify each Material Risk introduced or affected by the work.
For each Material Risk, define the smallest sufficient set of Verification Claims.
For each Verification Claim, select proportionate feasible Evidence through the technique workflow.

A Material Risk does not authorize maximum prevention.
Do not require a stronger product guarantee than accepted requirements justify.
Existing rejection, recovery, or operator control is sufficient when concrete evidence does not show a remaining material consequence.
When no proportionate evidence can address an accepted Material Risk, expose the unresolved requirement or product decision instead of inventing or silently weakening a claim.
Do not enumerate remote possibilities only to reject them.
When no Material Risk needs evidence beyond applicable mandatory gates, do not add verification work by convention.

This step is complete when every Material Risk has sufficient Verification Claims, every Claim has proportionate feasible Evidence, and no Claim requires an unjustified product guarantee.

## 3. Produce or review evidence

- When producing verification evidence, read [Produce Verification Evidence](references/PRODUCE-EVIDENCE.md).
- When reviewing completed work or submitted evidence, read [Review Verification Evidence](references/REVIEW-EVIDENCE.md).

This step is complete when every applicable workflow reaches its completion criterion.
