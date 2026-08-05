# Design a Verification Portfolio

Design from Material Risks before using individual existing tests or checks as precedent.

## 1. Define the portfolio claims

Identify the finite set of durable Material Risks for the supported system.
For each Material Risk, define the smallest set of Verification Claims that the maintained portfolio must establish.
Make each Claim one specific fact rather than a scenario list or evidence mechanism.
Do not create one Claim per existing test or check.

This step is complete when the proposed Claims are finite, distinct, sufficient for every Material Risk, and independent of the current evidence inventory.

## 2. Select sufficient evidence

Before selecting or reconciling portfolio evidence, read [Verification Techniques](TECHNIQUES.md).
For each Verification Claim, select the smallest sufficient evidence set at the least costly reliable supported seams.
Retain more than one mechanism or case only when each detects a materially distinct plausible failure that the other retained evidence would not establish reliably.
Use a small number of system sentinels for critical end-to-end paths.
Use lower-cost seams for variations that do not require the full system.
Define a runtime or stability budget only when an accepted constraint requires one, and give it an explicit measurement method.

This step is complete when every Claim has sufficient evidence and every expensive or durable mechanism has a distinct confidence contribution that justifies its lifecycle cost.

## 3. Reconcile the current portfolio

Map each existing test or check to every proposed Claim that it materially supports.
One mechanism may support multiple Claims.
Retain multiple mechanisms or cases for one Claim only when each makes a distinct necessary contribution.
Remove or consolidate evidence without such a contribution.
Add evidence only for a Claim that otherwise lacks sufficient coverage.
Use [Manage Project Verification Strategy](PROJECT-STRATEGY.md) to present the complete risk-first portfolio proposal for one approval and to record it only after approval.

Portfolio design is complete when every approved Claim has sufficient evidence, every retained mechanism makes a distinct necessary contribution at justified lifecycle cost, and the accepted strategy is recorded in its authoritative artifact.
