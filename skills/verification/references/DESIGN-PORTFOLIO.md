# Design a Verification Portfolio

Design from Material Risks before using individual existing tests or checks as precedent.

## 1. Define the portfolio claims

Identify the finite set of durable Material Risks for the supported system.
Define the Verification Claims that the maintained portfolio must establish.
Obtain approval from the applicable authority for the risks and claims before mapping existing evidence.
If approval is declined, stop and report the unresolved portfolio choices.
Do not create one Claim per existing test or check.

This step is complete when the approved Claims are finite, distinct, and independent of the current evidence inventory.

## 2. Assign evidence owners

For each approved Verification Claim, select one primary evidence owner at the cheapest reliable seam.
Use a small number of system sentinels for critical end-to-end paths.
Use lower-cost seams for variations that do not require the full system.
Define runtime and stability budgets with explicit measurement methods.

This step is complete when every Claim has one primary evidence owner and each expensive mechanism has a distinct justification.

## 3. Reconcile the current portfolio

Map each existing test or check to an approved Verification Claim.
Remove or consolidate evidence that owns no distinct Claim.
Add evidence only for an approved Claim that lacks sufficient coverage.
When one safe change is impractical, plan the migration as independently verifiable slices.
Present the resulting strategy to the applicable authority for approval.
If approval is declined, leave the accepted strategy unchanged and report the unresolved choices.
After approval, update the project verification strategy.

Portfolio design is complete when every retained test or check owns a distinct Claim, every approved Claim has sufficient evidence, and the portfolio meets its accepted budgets.
