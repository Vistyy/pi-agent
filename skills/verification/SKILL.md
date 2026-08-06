---
name: verification
description: Use whenever work has requirements whose satisfaction should be established or makes claims that should be supported with evidence.
---

# Verification

Design, produce, and review evidence that is proportionate to the plausible and meaningful ways work can fail to satisfy its requirements.
Do not require a test by default.

## Core model

Use `Material Risk -> Verification Claim -> Verification Evidence` as the canonical relationship.

**Material Risk**: A plausible failure with a meaningful consequence that is supported by accepted requirements or concrete evidence.
Do not use numerical risk scoring or invent unsupported requirements or speculative edge cases.

**Verification Claim**: A specific fact that evidence must establish to address one Material Risk.
A Claim is not a list of scenarios or an evidence mechanism.

**Verification Evidence**: An interpretable observation or artifact that supports or refutes a Verification Claim.

**Required Seam**: A boundary that a Verification Claim or accepted verification plan requires because interaction across it is part of the Claim.

Select the least costly reliable supported evidence that establishes the complete Claim through every Required Seam.
Use evidence that is independent from the implementation logic under review.

## Authority and context

Before applying a workflow, read the relevant requirements, instructions, accepted decisions, project strategy, and approved plans when they exist, and inspect the applicable executable mechanisms.
Use accepted requirements to define the required result, applicable instructions, accepted decisions, and project strategy to define verification constraints and mandatory gates, and approved plans to define current Material Risks, Claims, and Evidence.
Do not weaken those authorities or mandatory gates, and do not add product behavior only to make verification easier.
When accepted authorities conflict, stop and ask the applicable authority to resolve the conflict.
Use executable behavior to determine whether a verification mechanism exists, and report documentation that disagrees with its availability.
Update stale documentation only through its owning workflow and within the authorized scope.
Inspect only the authorities and mechanisms relevant to the current work.

## Choose the applicable workflow

Apply only the workflows that match the work:

- For work-level verification design, read [Design Verification for Current Work](references/DESIGN-WORK.md).
- For creation or redesign of a project verification portfolio, read [Design a Verification Portfolio](references/DESIGN-PORTFOLIO.md) instead of the work-level design workflow.
- For implementation or collection of evidence, read [Produce Verification Evidence](references/PRODUCE-EVIDENCE.md).
- For review of a verification design or produced evidence, read [Review Verification Design and Evidence](references/REVIEW-EVIDENCE.md).
- When deciding whether to add, change, or remove a durable cross-work verification decision, read [Manage Project Verification Strategy](references/PROJECT-STRATEGY.md).
  Routine work-level verification does not trigger this workflow.

The verification work is complete when every applicable workflow reaches its completion criterion.
