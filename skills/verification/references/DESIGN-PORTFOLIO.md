# Design a Verification Portfolio

Design from Material Risks before using individual existing tests or checks as precedent.

## 1. Define the portfolio claims

Identify the finite set of durable Material Risks for the supported system.
For each Material Risk, define the smallest set of Verification Claims that the maintained portfolio must establish.
Make each Claim one specific fact rather than a scenario list or evidence mechanism.
Do not create one Claim per existing test or check.

This step is complete when the proposed Claims are finite, each states a fact no other proposed Claim states, together they address every Material Risk, and they are independent of the current evidence inventory.

## 2. Select sufficient evidence

Before selecting or reconciling portfolio evidence, read [Verification Techniques](TECHNIQUES.md).
For each Verification Claim, select the smallest sufficient evidence set at the least costly reliable supported seams.
Retain an additional evidence mechanism or durable test case only when it addresses a Distinct Regression Failure.
Use end-to-end evidence only when the complete system path is a Required Seam.
Use lower-cost seams for variations that do not require the full system.
Define a runtime or stability budget only when an accepted constraint requires one, and give it an explicit measurement method.

This step is complete when every Claim has sufficient Evidence and no selected mechanism or durable test case can be removed without leaving a Claim unestablished or a Distinct Regression Failure undetected.

## 3. Reconcile the current portfolio

Map each existing test or check to every proposed Claim that it helps establish.
One mechanism may support multiple Claims.
Remove or consolidate any mechanism or durable test case whose removal leaves every Claim established and every Distinct Regression Failure detected.
Add evidence only for a Claim that otherwise lacks sufficient coverage.
Use [Manage Project Verification Strategy](PROJECT-STRATEGY.md) to present the complete risk-first portfolio proposal for one approval and to record it only after approval.

Portfolio design is complete when every approved Claim has sufficient Evidence, removing any retained mechanism would leave a Claim unestablished or a Distinct Regression Failure undetected, and the accepted strategy is recorded in its authoritative artifact.
