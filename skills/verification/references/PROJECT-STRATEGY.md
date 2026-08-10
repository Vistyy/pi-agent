# Manage Project Verification Strategy

## Decide whether strategy is needed

Use project strategy for durable verification decisions that apply across work and are not already sufficiently clear from a more authoritative source.
The absence of a strategy artifact does not create a need for one.
Do not use strategy to repeat generic verification guidance, list routine commands, restate executable configuration, preserve work history, or hold unapproved proposals.

A separate strategy is justified only when it closes a durable cross-work knowledge gap.

## Establish the current facts

Inspect relevant instructions, accepted decisions, executable configuration, maintained documentation, representative verification mechanisms, and known operational constraints.
Distinguish accepted policy from historical test conventions and prior plans.
Resolve a consequential conflict before recording strategy.

## Approve and record the strategy

Present the proposed durable decision and obtain its applicable approval before recording it as project strategy.
Record only current decisions that future work must know, such as non-obvious evidence constraints, mandatory gates, supported mechanism limits, intentionally retained broad evidence, or accepted runtime and stability constraints.

Use the project's established strategy artifact when one exists.
Otherwise, use `VERIFICATION.md` when repository-local Markdown is an appropriate authoritative medium.
Use the artifact's established structure.
When no structure exists, use only the structure needed to communicate the accepted decisions.
Remove replaced guidance in the same change.
If no project-specific strategy remains, remove the artifact after approval.
