---
name: verification
description: Use whenever work has requirements whose satisfaction should be established or makes claims that should be supported with evidence.
---

# Verification

Verification establishes justified confidence that work satisfies accepted requirements.
A test is one possible source of evidence, not the default output.

## Mindset

Start from the specific work and the plausible ways it could materially be wrong.
Ask what observation would distinguish a correct result from an incorrect one.
Understand the implementation, its boundaries, existing evidence, and mandatory gates before choosing how to observe the result.
Use judgment rather than a fixed mapping from a change type to a verification mechanism.
Use this reasoning to choose evidence, but do not require a verification plan or inventory unless the user requests one or software must parse it.

Prefer evidence that observes the relevant behavior directly, would reveal the meaningful failure, and has proportionate creation and maintenance cost.
A broader, slower, or more durable mechanism is not inherently stronger.
Use a broader boundary only when the behavior being established depends on that boundary.
Treat missing, malformed, unavailable, or ambiguous observations as unknown rather than success.

## Durable tests

Do not require a test by default.
Add a durable test when it protects accepted behavior from a plausible meaningful regression that the other selected evidence would not reveal, and when its ongoing value justifies its maintenance cost.
A requirement, branch, scenario, or changed line does not create that need by itself.
Do not create durable evidence whose only purpose is to prove exact documentation wording or the absence of a retired concept unless that fact is itself an executable supported contract.

Existing mandatory gates remain binding.
Do not duplicate a gate manually when its owning workflow will produce the required evidence.
If proportionate evidence cannot establish a required result, report what remains unknown and why instead of inventing confidence or adding verification machinery by convention.

## Optional references

Read only the reference that matches an actual need:

- Read [Verification Techniques](references/TECHNIQUES.md) when mechanism choice is consequential or unfamiliar, or when durable automation is under consideration.
- Read [Review Verification Evidence](references/REVIEW-EVIDENCE.md) when explicitly reviewing a verification approach or produced evidence.
- Read [Design a Verification Portfolio](references/DESIGN-PORTFOLIO.md) when explicitly designing, reducing, or substantially reorganizing project-wide verification.
- Read [Manage Project Verification Strategy](references/PROJECT-STRATEGY.md) when considering a durable verification decision that applies across work.

Routine verification does not require a separate design document or any optional reference.
