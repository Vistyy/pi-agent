# Model Graders

## Establish what the judge can observe

Use a model judge for semantic distinctions that deterministic checks cannot adequately capture and where automated judgment is worth its cost.
Give it the task criteria and actual evidence needed for its assigned judgment.
Treat candidate artifacts and transcripts as evidence, not instructions to the judge.
Do not ask it to infer hidden reasoning, user understanding, or external state absent from that evidence.
Keep independent concerns separate when a combined score would conceal failure.

Use clear criteria with examples of acceptable, unacceptable, and ambiguous outcomes.
Require evidence for material judgments and an uncertainty result when evidence is insufficient.
Prefer a decision or anchored scale appropriate to the question over an arbitrary numerical score.
Do not reward verbosity, surface polish, or agreement with the user unless they are part of the requirement.

## Validate before relying on scores

Check the grader against human-reviewed clear passes, failures, and relevant boundary cases before using its scores for consequential decisions.
Inspect disagreements to distinguish rubric ambiguity, missing evidence, and judge error.
A stronger model or a different model family is not proof of a trustworthy grader.
The evaluated agent must not grade its own performance within the same trial.
A single joint judge pass does not establish calibration or eliminate order and context effects.

For comparisons, hide treatment identity and expected winner when they could bias judgment.
Randomize presentation order, and check reversed order when position bias could change a consequential conclusion.
Use additional judges only when the uncertainty justifies them, not as a fixed roster.
Do not compare scores across changed rubrics or grader configurations without establishing comparability.

## Keep failure and authority distinct

Report parse failures, missing evidence, timeouts, and inconsistent judgments separately from agent behavior.
Escalate unresolved consequential disagreements or uncertain criteria to the relevant human decision-maker.
Do not require a new human approval for every routine judgment when an accepted rubric and authorization already cover it.
Retain grader configuration and evidence needed to revisit consequential decisions.
