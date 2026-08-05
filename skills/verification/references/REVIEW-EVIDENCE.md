# Review Verification Design and Evidence

Apply the review that matches the submitted work.
When both a verification design and produced evidence are submitted, review the design before its evidence.

## Review a verification design

Evaluate the design against accepted requirements and applicable verification constraints.
Confirm that each Material Risk is plausible, meaningful, and supported by accepted requirements or concrete evidence.
Confirm that every Verification Claim states one specific fact and is sufficient to address one Material Risk without requiring an unjustified product guarantee.
Confirm that each selected evidence mechanism can establish its Verification Claim at proportionate Lifecycle Cost through every Required Seam.
For each required durable test, apply the admission rule to every test case and confirm its Distinct Regression Failure, the insufficiency of existing or one-time Evidence, and the proportionality of Lifecycle Cost.
Confirm that the design includes every applicable mandatory gate.

Report a design finding for each unsupported Material Risk, insufficient Verification Claim, unsuitable or duplicative evidence mechanism, unjustified durable test, or missing mandatory gate.
Design review is complete when every applicable Material Risk, Verification Claim, evidence mechanism, and mandatory gate is sufficient or has a concrete design finding.

## Review produced evidence

When an accepted verification design exists, use its Verification Claims.
Otherwise, derive the applicable Claims from accepted requirements and the Material Risks affected by the work without requiring a new design artifact.
Evaluate every applicable Verification Claim independently against the submitted evidence.
Confirm that the Evidence uses every Required Seam or another mechanism that establishes the same Claim through every Required Seam.
Confirm that the evidence corresponds to the exact work, revision, and relevant environment to which the Claim applies.
Confirm that the evidence is interpretable and sufficient for its Material Risk.
Confirm that every applicable mandatory gate passed.

When reviewing multiple comparable Claims, use this branch-specific table:

| Claim | Evidence | Verdict | Gap |
| --- | --- | --- | --- |
| <Verification Claim> | <Verification Evidence> | <sufficient or finding> | <unsupported fact or none> |

When accepted requirements retire a concept, inspect targeted diff, search, and inspection evidence across the affected surfaces.
Require an accepted current boundary for each retained representation of the retired concept.
Do not request durable evidence whose only purpose is to prove that the retired concept is absent.
Report an evidence finding when submitted evidence does not establish its Claim.

Distinguish an inability to execute a valid review from a valid judgment that evidence is insufficient.
For the first case, stop the review and report the failed operation, observed error, and missing capability as a review-tooling failure.
For the second case, report an evidence finding that identifies the unsupported Verification Claim.

Evidence review is complete when every applicable Verification Claim and mandatory gate has sufficient evidence or a concrete evidence finding.
