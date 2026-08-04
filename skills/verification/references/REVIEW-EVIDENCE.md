# Review Verification Design and Evidence

Apply the review that matches the submitted work.
When both a verification design and produced evidence are submitted, review the design before its evidence.

## Review a verification design

Evaluate the design against accepted requirements and applicable verification constraints.
Confirm that each Material Risk is plausible, meaningful, and supported by accepted requirements or concrete evidence.
Confirm that the Verification Claims are sufficient to address each Material Risk without requiring an unjustified product guarantee.
Confirm that each selected evidence mechanism can establish its Verification Claim at proportionate cost through a reliable seam.
Confirm that the design includes every applicable mandatory gate.
Do not add unsupported requirements or speculative edge cases during review.

Report a design finding for each unsupported Material Risk, insufficient Verification Claim, unsuitable evidence mechanism, or missing mandatory gate.
Design review is complete when every reviewed Material Risk, Verification Claim, evidence mechanism, and mandatory gate is sufficient or has a concrete design finding.

## Review produced evidence

Evaluate each Verification Claim independently against the submitted evidence and accepted requirements.
Confirm that the evidence uses a materially required seam or a reliable equivalent.
Confirm that the evidence is current, interpretable, and sufficient for its Material Risk.
Confirm that every applicable mandatory gate passed.
Do not add unsupported requirements or speculative edge cases during review.

When accepted requirements retire a concept, inspect targeted diff, search, and inspection evidence across the affected surfaces.
Require an accepted current boundary for each retained representation of the retired concept.
Do not request durable evidence whose only purpose is to prove that the retired concept is absent.
Report an evidence finding when submitted evidence does not establish its Claim.

Distinguish an inability to execute a valid review from a valid judgment that evidence is insufficient.
For the first case, stop the review and report the failed operation, observed error, and missing capability as a review-tooling failure.
For the second case, report an evidence finding that identifies the unsupported Verification Claim.

Evidence review is complete when every Verification Claim and mandatory gate has sufficient evidence or a concrete evidence finding.
