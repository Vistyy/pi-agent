---
name: verification
description: Use when designing verification, producing evidence that work satisfies requirements, or reviewing verification design or evidence.
---

# Verification

Design, produce, and review evidence that is proportionate to the plausible and meaningful ways work can fail to satisfy its requirements.
Do not require a test by default.

## Canonical terms

**Material Risk**: A plausible failure with a meaningful consequence that is supported by accepted requirements or concrete evidence.
Do not use numerical risk scoring.
Do not invent unsupported requirements or speculative edge cases.

**Verification Claim**: A specific fact that evidence must establish to address one Material Risk.
A Claim is not a list of scenarios or an evidence mechanism.

**Verification Evidence**: An interpretable observation or artifact that supports or refutes a Verification Claim.

## Authority

Accepted requirements define the required result.
Applicable instructions and accepted decisions define verification constraints and mandatory gates.
Project verification strategy owns accepted verification decisions that apply across work.
Approved work-specific plans apply the relevant strategy and define current Material Risks, Verification Claims, and Verification Evidence.
Executable behavior and configuration determine whether a named mechanism exists.

Verification must not weaken accepted requirements, mandatory gates, approved plans, or accepted project strategy.
When accepted authorities conflict, stop and ask the applicable authority to resolve the conflict.
When documentation disagrees with executable availability, use executable behavior to determine availability and report the stale documentation.
Update that documentation only through its owning workflow and within the authorized scope.
Do not add product behavior only to make verification easier.

Do not audit every verification source during each invocation.
Inspect only the authorities and mechanisms relevant to the current work.

## 1. Discover the verification context

Read the applicable requirements, instructions, context, accepted decisions, approved verification plans, and project verification strategy when they exist.
Inspect the executable mechanisms relevant to the work.
When project verification strategy is missing or needs revision, read [Manage Project Verification Strategy](references/PROJECT-STRATEGY.md).

This step is complete when the required result, accepted verification constraints, relevant mechanisms, and mandatory gates are known, and each consequential conflict or unknown has an explicit resolution path.

## 2. Design verification

Use this branch when planning verification or selecting evidence for current work.
When creating or redesigning a project verification portfolio, read [Design a Verification Portfolio](references/DESIGN-PORTFOLIO.md) and follow that workflow instead of this work-level design branch.
Before selecting evidence, read [Verification Techniques](references/TECHNIQUES.md).

Identify each Material Risk introduced or affected by the work.
For each Material Risk, define the smallest sufficient set of Verification Claims.
For each Verification Claim, select proportionate feasible Verification Evidence through the technique workflow.

A Material Risk does not authorize maximum prevention.
Do not require a stronger product guarantee than accepted requirements justify.
Existing rejection, recovery, or operator control is sufficient when concrete evidence does not show a remaining material consequence.
When no proportionate evidence can address an accepted Material Risk, expose the unresolved requirement or product decision instead of inventing or silently weakening a Claim.
Do not enumerate remote possibilities only to reject them.
When no Material Risk needs evidence beyond applicable mandatory gates, do not add verification work by convention.

When the design contains multiple comparable risk records, use this branch-specific table:

| Risk | Claim | Evidence |
| --- | --- | --- |
| <Material Risk> | <Verification Claim> | <Verification Evidence> |

Design is complete when every Material Risk has sufficient Verification Claims, every Claim has proportionate feasible Evidence, every applicable mandatory gate is included, and no Claim requires an unjustified product guarantee.

## 3. Produce verification evidence

Use this branch when implementing work or otherwise collecting evidence.
When applicable Risks or Claims are not yet known, complete the design branch first.
Before selecting or materially changing an evidence mechanism, read [Verification Techniques](references/TECHNIQUES.md).
Read [Produce Verification Evidence](references/PRODUCE-EVIDENCE.md) and follow its workflow.

Production is complete when the evidence-production workflow reaches its completion criterion.

## 4. Review verification

Use this branch when reviewing a proposed verification design, completed work, or submitted evidence.
When reviewing a verification design or materially reconsidering an evidence mechanism, read [Verification Techniques](references/TECHNIQUES.md).
Read [Review Verification Design and Evidence](references/REVIEW-EVIDENCE.md) and follow the applicable workflow.

Review is complete when every applicable review workflow reaches its completion criterion.
