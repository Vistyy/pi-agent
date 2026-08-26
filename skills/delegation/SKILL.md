---
name: delegation
description: Use when deciding whether or how to use owned agents for evidence collection, context compression, independent alternatives, bounded experiments, or bounded difficult reasoning.
---

# Delegation

Use owned agents to save parent context or obtain a contribution whose independence matters.
The parent retains the understanding and judgment needed to answer the user.

## Decide whether to delegate

Delegate only when the contribution has one of these benefits:

- **Context compression:** The work requires many reads, checks, or other operations, and an agent can return a much smaller evidence report with concrete citations.
- **Useful independence:** Independent alternatives or challenges are valuable because they should not inherit the parent's developing conclusion.
- **Bounded experimentation:** A decision-driving uncertainty needs a real-system experiment whose setup, runs, or artifacts would consume substantial parent context.

Work directly when a few targeted operations can establish the needed evidence.
Do not delegate merely because a task is important, unfamiliar, or complex.
Do not delegate the complete user outcome or the final judgment.

## Preserve parent understanding

Before dispatch, identify what the parent must inspect or reason through directly to evaluate the contribution.
Keep the decisive framing, integration, and final choice in the parent.
Do not leave the parent with only prose assembly after agents perform all meaningful investigation.

## Frame each contribution

Each assignment should provide:

- One requested contribution and its intended use.
- Relevant starting anchors already known to the parent.
- Boundaries needed to avoid overlap or unintended expansion.
- The evidence or result the parent needs.
- A stopping condition when completion would otherwise be ambiguous.
- Authorization for consequential state changes, external effects, or metered operations.

Do not repeat stable identity instructions in the assignment.
Do not prescribe exploratory details the agent should determine itself.
Give independent agents the same relevant brief without including another agent's conclusion.

## Dispatch and integrate

Use one retained agent when follow-up work will benefit from its existing context.
Start independent contributions together when their scopes do not overlap.
For coverage work, define the parent's area and each agent's distinct area before dispatch.

Continue the parent's non-overlapping investigation while agents work.
Use the batch completion follow-up rather than polling `list_agents`.
Use `list_agents` only to diagnose missing completion or blocked lifecycle state.

Read every required result and inspect the cited evidence needed to evaluate it.
Treat failed or incomplete contributions as visible gaps.
Resolve disagreements, unsupported inferences, and material unknowns before expanding the delegation stage.
Use `send_agents` when retained context materially helps a focused follow-up, and use a new agent when independence is required.

Do not forward an agent report as the answer.
The parent produces the final conclusion from direct work and integrated contributions.
