---
name: delegation
description: Use when deciding whether or how to use owned agents for read-only investigation, analysis, alternatives, corroboration, or continuing collaboration.
---

# Delegation

Owned agents contribute to the parent's work.
They do not replace the understanding the parent needs to integrate evidence and make the final judgment.

The parent owns the user outcome, delegation shape, direct investigation, integration, final judgment, and communication.
An owned agent may investigate, reason, compare, criticize, or make a bounded recommendation within its assignment.

## 1. Select a pattern

Choose the pattern from the relationship between the contributions, not from task size.

### Direct work

Work without owned agents when the parent needs the raw evidence to reason correctly, or when a few short reads or one targeted command can establish it compactly.

Completion means the parent has gathered the required evidence directly.

### Collaborative thread

Use one retained agent when one separate line of inquiry benefits from multiple exchanges.

1. The parent establishes enough initial context to frame a precise contribution.
2. The parent starts one agent with `keep_open: true`.
3. The parent continues its own non-overlapping investigation while the agent works.
4. The parent integrates the result into its developing understanding.
5. The parent sends a focused follow-up when the agent's retained source context helps answer the next question or challenge a provisional interpretation.
6. The parent closes the agent when no further context-local exchange is expected.

A collaborative thread is complete when the parent has integrated the contribution and resolved or exposed its material uncertainties.

### Coverage fan-out

Use coverage fan-out when several distinct contributions are all needed for one result.

1. The parent defines a coverage map before dispatch.
2. The coverage map names the understanding the parent will establish directly and one non-overlapping contribution for each agent.
3. The parent starts all currently independent contributions in one `start_agents` call.
4. The parent investigates its own coverage area while the agents work.
5. The parent maps every returned result back to the coverage map and identifies gaps, overlaps, and contradictions.
6. The parent assigns a new focused contribution only when a material gap remains.
7. The parent synthesizes the complete result from its direct work and the agent contributions.

A failed or incomplete agent leaves a visible coverage gap.
Do not silently treat reduced coverage as completion.

Coverage fan-out is complete when every required area has usable evidence or is reported as unresolved.

### Independent comparison

Use independent comparison when competing explanations, alternatives, or corroborating judgments should not influence one another.

1. The parent defines the common question, artifact, and comparison criteria before dispatch.
2. The parent sends the same relevant brief to at least two agents and states that overlap is intentional.
3. Each agent works without seeing another agent's result.
4. The parent performs enough direct inspection to judge the returned claims.
5. The parent compares agreements, disagreements, evidence quality, and omitted concerns against the declared criteria.
6. The parent selects, combines, or rejects conclusions with its own rationale.

Agreement is supporting evidence, not proof.
Disagreement must remain visible until the parent resolves it or reports the uncertainty.

Independent comparison is complete when the parent has made and supported its own judgment.

This step is complete when one pattern is selected and its completion condition fits the requested outcome.

## 2. Preserve parent understanding

Before dispatch, identify the outcome and the understanding the parent must establish directly.
When the final judgment depends on understanding an external system, keep its architecture spine in the parent.
The architecture spine consists of the entry point, one representative path, and each boundary that can change the conclusion.

Do not assign one agent the complete understanding needed for the parent's final judgment.
Do not make all meaningful source inspection agent-owned while leaving only prose assembly to the parent.

This step is complete when the parent-owned investigation and every agent contribution have distinct purposes.

## 3. Write each assignment

Give each agent the minimum context needed to contribute correctly.
Each assignment must identify:

- The user outcome when it changes how the contribution should be interpreted.
- One requested contribution.
- Starting anchors already known to be relevant.
- Scope boundaries needed to prevent overlap or unintended expansion.
- The result the parent needs from this contribution.
- A stopping condition when completion would otherwise be ambiguous.

Do not repeat stable identity instructions in an assignment.
Do not prescribe sources or procedures that the agent must discover through its own investigation.
Do not ask an agent to perform the complete user task and return a finished answer.

For complementary contributions, give each agent a distinct scope.
For independent comparison, give agents the same relevant question and do not include another agent's conclusion.

This step is complete when each assignment can be understood independently and its result has a named use in the selected pattern.

## 4. Integrate before expanding

After dispatch, continue the parent-owned, non-overlapping investigation while agents work.
The batch completion follow-up is the delivery boundary for agent results.
Do not use `list_agents` as a completion polling loop.
Use it only to diagnose lifecycle state when a completion notification appears missing or an agent may be blocked.

When the parent-owned investigation finishes before required contributions arrive, end the current turn and wait for the batch completion follow-up.
Do not finalize the outcome before every required contribution has arrived or has been explicitly accounted for as a gap.
Do not interrupt or rush an agent merely because the parent's direct work finished first.
When an interruption is required for another reason, wait for the resulting batch notification and retain the incomplete contribution as a visible gap.

Read every returned result that contributes to the outcome.
Inspect cited sources or artifacts needed to understand, challenge, or connect a result.
Do not repeat an agent's complete search merely to reproduce it.

Reconcile overlaps, disagreements, unsupported inferences, and material unknowns before starting another delegation stage.
Use `send_agents` when an existing agent's retained context materially benefits the next focused contribution.
Use a new agent when independence from earlier context is required.

Do not forward an agent report as the parent's answer.
The parent must produce the conclusion from its direct work and integrated contributions.

This workflow is complete when the parent can explain and support the result, every required contribution is accounted for, and remaining uncertainty is explicit.
