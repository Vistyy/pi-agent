---
name: reflect
description: Investigate a consequential correction or suspected recurring failure in code or the way work was done. Use when the user asks to reflect or when an incident suggests a wider cause; skip routine failures with no credible wider lesson.
---

# Reflect

Investigate a concrete incident before drafting a lesson. A correction is a signal to investigate; it does not by itself establish a preventable miss, its cause, or a recurring pattern.

## Establish what happened

Identify the expected outcome, what happened instead, and the artifacts that show it. Inspect relevant source, change history, checks, and session decisions. Separate observations, causal inferences, and unknowns. Test competing explanations rather than choosing the first plausible story.

Trace both how the problem arose and why existing feedback did not surface it earlier. Follow concrete leads to other instances and affected consumers. Distinguish resemblance from a shared underlying cause. Bound searches of past sessions or other repositories to relevant leads; report what was not examined.

Use delegation when an independent investigation would improve the evidence or challenge the explanation. Scale it to the incident without prescribing a worker count or sequence. Treat delegated conclusions as evidence, not the verdict.

If the incident is isolated, say so. If its cause remains uncertain, identify the next observation that would distinguish the explanations. Do not invent a systemic lesson to fill the report.

## Find the intervention

Ask first whether changing the underlying design, workflow, or ownership removes the cause. A restriction that merely conceals the symptom is not a fix.

For a repeatable cause, compare plausible prevention mechanisms, beginning with those that need the least ongoing judgment:

1. Make the mistake difficult or impossible through the existing design, types, APIs, ownership boundaries, or platform behavior.
2. Use a narrow deterministic check when it can distinguish the unwanted pattern from legitimate cases. Consider existing lint, static analysis, tests, measurements, and runtime checks before building new machinery.
3. If judgment is essential, consider guidance at the point of work or a scoped human review. Instructions are cheap to add but easy to miss.
4. Consider a semantic reviewer only when simpler measures cannot make the needed judgment reliably. Account for model cost on every run, latency, false positives, false negatives, and prompt or input drift.

This is an order of investigation, not a requirement to install something from each step. Compare implementation and maintenance cost, operating cost, reach, reliability, and the harm of mistakes. Prefer the cheapest mechanism that addresses the actual cause at acceptable reliability. No durable guard is a valid result.

Before recommending a mechanism, show how it would prevent or detect a representative failure without blocking a legitimate case. For a semantic mechanism, use bounded real examples; do not describe one successful model run as a guarantee.

## Bring back a decision

Give the user a concise account of the incident, supported causal explanation, competing explanations, scope checked, and remaining uncertainty. Distinguish the root-cause change from any proposed recurrence guard. Present the recommended intervention, meaningful rejected alternatives, expected costs, and evidence that would verify it.

Do not add or change a durable guard without the user's confirmation. Ordinary fixes within the original task do not become approval requests merely because this investigation considered them.
