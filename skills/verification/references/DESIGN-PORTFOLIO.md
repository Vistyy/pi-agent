# Design a Verification Portfolio

Design from Material Risks before using individual existing tests as design precedent.

## 1. Define the portfolio claims

Identify the finite set of durable Material Risks for the supported system.
Define the Verification Claims that the maintained portfolio must establish.
Obtain user approval for the risks and claims before mapping existing tests.
If the user declines them, stop and report the unresolved portfolio choices.
Do not create one claim per existing test.

This step is complete when the approved claims are finite, distinct, and independent of the current test inventory.

## 2. Assign evidence owners

For each approved Verification Claim, select one primary evidence owner at the cheapest reliable seam.
Use a small number of system sentinels for critical end-to-end paths.
Use lower-cost seams for variations that do not require the full system.
Define runtime and stability budgets with explicit measurement methods.

This step is complete when every claim has one primary evidence owner and each expensive mechanism has a distinct justification.

## 3. Reconcile the current portfolio

Map each existing check or test to an approved Verification Claim.
Remove or consolidate checks that own no distinct claim.
Add evidence only for an approved claim that lacks sufficient coverage.
When one safe change is impractical, plan the migration as independently verifiable slices.
Present the resulting strategy for user approval.
If the user declines it, leave `VERIFICATION.md` unchanged and report the unresolved choices.
After approval, update `VERIFICATION.md`.

Portfolio design is complete when every retained check owns a distinct claim, every approved claim has sufficient evidence, and the portfolio meets its accepted budgets.
