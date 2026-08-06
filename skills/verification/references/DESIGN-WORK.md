# Design Verification for Current Work

Identify each Material Risk introduced or affected by the work.
For each Material Risk, define the smallest sufficient set of Verification Claims.
For each Verification Claim, select proportionate feasible Verification Evidence.
Before proposing a durable automated test or selecting an unfamiliar or unsupported mechanism, read [Verification Techniques](TECHNIQUES.md).

A Material Risk does not authorize maximum prevention.
Do not require a stronger product guarantee than accepted requirements justify.
Treat existing rejection, recovery, or operator control as sufficient only when accepted requirements or concrete evidence show that it prevents, contains, or recovers from the identified consequence.
When no proportionate evidence can address an accepted Material Risk, expose the unresolved requirement or product decision instead of inventing or silently weakening a Claim.
Do not enumerate remote possibilities only to reject them.
When no Material Risk needs evidence beyond applicable mandatory gates, do not add verification work by convention.

When the design contains multiple risk records, use this branch-specific table:

| Risk | Claim | Evidence |
| --- | --- | --- |
| <Material Risk> | <Verification Claim> | <Verification Evidence> |

Design is complete when every Material Risk has sufficient Verification Claims, every Claim has proportionate feasible Evidence, every applicable mandatory gate is included, and no Claim requires an unjustified product guarantee.
