---
name: improve-codebase
description: "[M] Find the smallest evidence-backed codebase improvement that is not already tracked."
disable-model-invocation: true
---

# Improve Codebase

Recommend the smallest evidence-backed improvement that reduces the cost, risk, or uncertainty of future maintenance without duplicating known work.
Deletion, direct simplification, and no change are valid outcomes.

## 1. Find a current maintenance cost

If the user names a target, start there.
Otherwise, inspect the current codebase broadly.
Discover and follow the repository's applicable instructions, accepted decisions, and domain terms.

Inspect enough current implementation, callers, tests, and checks to identify concrete maintenance costs.
Look especially for repetition, unnecessary indirection, obsolete or custom machinery, and verification friction.
Use repository history only when it can establish or refute a recurring cost.

Keep a candidate only when current evidence from named files, changes, failures, tests, or commands supports the cost.
If a candidate fails a later check, return to this step and inspect the next strongest candidate.

## 2. Exclude known work and respect accepted constraints

Discover the repository's authoritative mechanisms for recording work instead of assuming a particular CLI, file format, or hosting service.
Search relevant tasks, issues, plans, roadmaps, or equivalent records by component, cost, cause, and intended outcome rather than exact wording alone.

Reject a candidate that an existing work record substantively covers, regardless of its status or label.
If a record covers only part of the candidate, continue only with a distinct residual problem supported by its own evidence.
If similar work was completed, verify that the current cost remains.
If active work is expected to materially change the candidate's evidence or change surface, defer the candidate unless it remains independently justified after that work.

Check applicable accepted decisions and explanations for intentional complexity or trade-offs.
An accepted trade-off does not automatically exclude an improvement.
Continue only when the candidate respects the accepted constraint or material new evidence justifies reconsidering it.

If an unavailable authoritative source is necessary to determine whether the candidate is already known, report that the check could not be completed instead of claiming a novel recommendation.

## 3. Select the smallest improvement

Trace only the relationships needed to establish the cost, its cause, and the safe change boundary.
Define the observable maintenance improvement.
Compare the direct deletion or simplification with other credible treatments by maintenance benefit, added complexity, risk, and reversibility.
Recommend the smallest treatment that fully produces the improvement and preserves current requirements and constraints.

If no candidate passes the evidence, known-work, and constraint checks, report that no untracked recommendation was found within the inspected scope.

## 4. Present the result

Return concise prose under these headings in this order:

1. `Recommendation`
2. `Evidence`
3. `Known-work and constraint check`
4. `Cost, risk, and verification`

Name the authoritative work records and accepted decisions checked.
Distinguish relevant existing work from the recommendation and disclose any unavailable relevant source.
Present multiple options only when evidence leaves a genuine decision unresolved.

The review is complete when the evidence establishes a current maintenance cost, the recommendation is not covered by known work, accepted constraints are preserved or materially reconsidered, and the user can decide whether to accept the smallest supported improvement.
