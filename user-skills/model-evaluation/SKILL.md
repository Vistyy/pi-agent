---
name: model-evaluation
description: "[M] Evaluate agent or LLM behavior to diagnose failures, check capability or regressions, measure reliability, or compare configurations."
disable-model-invocation: true
---

# Model Evaluation

Use evaluations to answer a specific question about the behavior of a configured agent or LLM system.
The evaluated system includes its model, instructions, context, tools, harness, and environment, not just the model name.
This skill owns evaluation design and interpretation; coordination tools or an existing runner own execution mechanics.
It does not require Workgraph, a particular framework, multiple agents, or a model judge.

## Choose the question

Identify the decision the evidence must inform and the accepted behavior being evaluated.
Do not let an easy metric, existing case, or grader create a requirement.
Select the relevant scope:

- **Diagnosis:** Explain an observed failure by inspecting the outcome and trace, then run a targeted reproduction only when needed to distinguish causes.
- **Capability:** Establish whether the configured system can perform the task under stated conditions.
- **Regression:** Check whether a change breaks previously accepted behavior using the relevant retained cases.
- **Reliability:** Estimate how consistently the system performs across relevant cases and repeated trials.
- **Comparison:** Determine whether a configuration change improves behavior or justifies its cost.

For reliability estimates, causal comparisons, or claims that scaffolding can be removed, read [Comparisons and reliability](references/COMPARISONS.md).
When semantic judgment requires an automated model grader, read [Model graders](references/MODEL-GRADERS.md).
When creating or maintaining a durable suite, read [Maintained suites](references/SUITES.md).
A diagnosis or bounded capability check does not automatically require those workflows.

## Design the smallest informative check

Define a realistic case, the conditions under which the behavior is required, and observable evidence of success, failure, or uncertainty.
Include an adjacent case when guidance could over-activate outside its intended scope.
Grade required meaning and consequences rather than exact wording or tool order unless those are requirements.
Do not hide necessary task requirements from the agent; keep reference answers, private grading logic, and comparison metadata separate from its normal context.
Do not distort a realistic repository by banning ordinary words such as `test` from candidate-visible files.

Choose the cheapest trustworthy observation at the actual boundary.
Use deterministic checks for exact state and executable outcomes, and human judgment for a small semantic investigation when practical.
Use model grading only when it adds useful capacity and can be validated.
A transcript claim does not establish a repository or external-state outcome.
Reading a skill does not establish that it improved behavior.

Check discovery, loading, configuration, and tool registration through ordinary deterministic tests where possible.
When evaluating behavioral effectiveness in an integrated system, establish that the intended configuration actually reached the agent.
Do not substitute pasted instructions for native loading when native loading is part of the question.

## Run and inspect

Use the existing supported runner or the smallest bounded experiment that exercises the required boundary.
Do not build a general evaluation framework merely to answer one question.
Stay within authorized effects and cost, isolate writable trials from unrelated state, and define appropriate stopping limits.
Retain the configuration, case, relevant trace, actual outcome, and failures needed to interpret the result.
Record usage and timing when cost or performance affects the decision.

Inspect enough outcome and trace evidence to distinguish an agent error from faulty setup, grading, or an invalid case.
A valid attempt that fails to finish can be a behavioral failure; do not automatically discard it as a dropout.
Report an infrastructure interruption separately from a violation of a supported product limit.
If an uncertain operation may have changed state, inspect that state before retrying.

## Report the supported conclusion

State the question, tested configuration, observations, material limitations, and decision supported by the evidence.
Keep behavioral correctness, resulting state, quality, and cost distinct where combining them would hide a failure.
Do not let a high average offset a prohibited action or a failed hard requirement.
One successful trial demonstrates an occurrence, not reliable behavior or causal improvement.
Preserve failed and contradictory evidence instead of selecting the best run.

Stop when the named decision has sufficient evidence, or explain what remains unresolved and the smallest useful next check.
An evaluation finding does not independently authorize product changes, instruction changes, or weakening a requirement.
