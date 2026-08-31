---
name: model-evaluation
description: "[M] Design, implement, run, and interpret model-driven evaluations for agent behavior, skills, prompts, extensions, and harness changes."
disable-model-invocation: true
---

# Model Evaluation Contract

Use model evaluations to answer named decision-relevant questions about observable behavior in a configured agent system.
Treat this contract as framework-independent.
Select evaluation infrastructure only after the required cases, execution boundaries, evidence, and graders are understood.

## Working vocabulary

**Behavior requirement**: An accepted product, interaction, safety, or capability behavior that the configured system must exhibit.

**Configured system**: The complete evaluated combination of model, model version, thinking level, harness, instructions, context, skills, extensions, tools, environment, and relevant settings.

**Case**: One scenario with defined inputs, applicability conditions, success evidence, and failure evidence.

**Trial**: One execution of one case by one configured system.

**Trajectory**: The complete relevant record of a trial, including messages, tool calls, intermediate results, and state changes.

**Outcome**: The observable final state produced by a trial.

**Grader**: Deterministic code, a calibrated model, or a human judgment that evaluates one defined aspect of a trajectory or outcome.

**Control condition**: The configured system without the intervention under evaluation.

**Treatment condition**: The same configured system with the intervention under evaluation.

**Baseline result**: The measured result of a named configuration, case revision, grader revision, and trial set.

**Treatment effect**: The measured behavioral difference between treatment and control.

**Capability evaluation**: An evaluation of whether a configured system can exhibit desired behavior in challenging cases.

**Regression evaluation**: An evaluation protecting behavior already accepted and established as sufficiently reliable.

**Comparative evaluation**: An evaluation of whether one configured system performs materially better than another.

## 1. Define the claim and its authority

Start every evaluation from an accepted behavior requirement.
An eval case, grader, historical example, framework, or easily measured property must not create a requirement merely because it can measure one.

Before creating a case, state:

- The behavior or capability being evaluated.
- The conditions under which it is required.
- The realistic important failure the case must distinguish.
- The observable evidence that supports success, failure, or uncertainty.
- The decision the result will inform.

Identify whether the evaluation is measuring a capability, regression, comparison, or a stated combination of these purposes.
Do not use one purpose as evidence for another without exercising the additional boundary.

Report only claims supported by the observed boundary.
A transcript score does not establish a correct repository outcome.
A correct repository outcome does not establish good mentoring behavior.
User agreement or exposure to an explanation does not establish learning or transfer.
One successful trial does not establish reliable behavior.

## 2. Separate required behavior from its implementation

Define durable evaluation suites around accepted behaviors and capabilities rather than the current artifact implementing them.
Cases and semantic rubrics must not require a particular skill, extension, prompt, tool, or workflow unless that mechanism is itself part of the accepted requirement.

Evaluate an implementation as a treatment against the same capability suite used for its control.
Verify deterministic discovery, loading, routing, injection, configuration, persistence, and tool registration through ordinary unit or integration tests outside the model-evaluation suite.
During a behavioral trial, verify required treatment delivery only as a precondition of trial validity.
A failed delivery precondition invalidates the trial instead of becoming a behavioral case result.
Passing deterministic implementation tests does not establish behavioral effectiveness.

Preserve capability evaluations when an implementation changes or is removed.
An implementation may become obsolete while the behavior it protected remains required.

When an instruction, skill, prompt, extension, or other mechanism is intended to change model behavior, evaluate it against a control that differs only by the intervention whenever technically feasible.
Require both an acceptable treatment result and evidence that the intervention provides material value over the control.

Re-run control and treatment conditions when qualifying a new model or materially changing the harness.
Treat scaffolding as a removal candidate when the control reliably satisfies the accepted behavior and the treatment no longer provides meaningful benefit or unique protection.
Preserve the behavioral requirement and its regression coverage after removing scaffolding.

Do not conclude that scaffolding is redundant from a single trial, an uncalibrated judge, a weak case, or a saturated score where both conditions pass without encountering the targeted failure.

## 3. Design discriminating cases

Derive every case from an accepted requirement and a realistic important failure.
Record the requirement, the failure being discriminated, the applicability conditions, the observable boundary, and the evidence distinguishing success from failure.

Design the scenario to create a genuine opportunity for compliant and noncompliant behavior.
A case that passes regardless of whether the target capability is exercised provides no useful evidence about that capability.

Specify required meaning and prohibited consequences rather than expected wording, response structure, tool sequence, or implementation strategy unless those exact details are requirements.
Permit valid approaches that satisfy the accepted behavior.

Keep each case focused enough to diagnose its primary failure while retaining enough context to make the interaction realistic.
When several behaviors compose in one workflow, identify the primary capability and grade additional consequences separately.

Use controlled fixtures to isolate causal behavior and historical failures to represent actual use.
Preserve the material conditions of historical cases without requiring incidental wording from the original conversation.

Include adjacent cases when a rule could plausibly over-activate.
An intervention must not improve its target behavior by applying it indiscriminately where it is irrelevant.

Include typical, difficult, and adversarial variations only when they represent plausible supported use.
Generated variations must receive human review against the original requirement before admission.

A case must name its observable boundary.
Repository outcomes require repository evidence.
Tool behavior requires trajectory evidence.
Conversational behavior requires the relevant multi-turn transcript.
Do not grade a proxy merely because the required outcome is harder to observe.

Version cases and preserve their reason for existence.
When behavior or supported use changes, update or retire the case explicitly instead of weakening its rubric until current outputs pass.

## 4. Execute the real configured system

Exercise the supported boundary needed to establish the claim.
Use the Pi SDK and normal resource-loading behavior when evaluating Pi skills, extensions, prompts, context, tools, or their interactions.
Do not replace actual discovery or runtime delivery with manually pasted instructions when evaluating an intervention in its supported integrated configuration.

Provide isolated and integrated execution when interaction with the broader harness can materially affect behavior.
Use isolated runs to attribute failures and integrated runs to establish behavior in the supported configuration.
Do not treat isolated success as proof of integrated behavior.

Keep control and treatment conditions identical except for the intervention being measured.
Configure the intervention outside the evaluated conversation when an activation command would otherwise contaminate one condition with additional conversational context.

Use stable, disposable fixtures.
Run state-changing agents in temporary repositories, worktrees, or sandboxes with known initial state and inspectable final state.
Do not risk unrelated or mutable production state.

Use real tools and dependencies when the behavior depends on their semantics and the operation is safe, bounded, and reproducible.
Replace external systems with controlled adapters only when necessary.
State which real behavior each replacement reproduces and leaves untested.

Do not expose rubrics, expected decisions, hidden fixture facts, control results, or judge outputs to the agent unless they are part of normal supported context.

Capture the complete trial configuration, trajectory, outcome, usage, duration, and failure state.
Give each grader only the evidence required by its rubric while retaining the complete evidence for diagnosis.

Bound trials with explicit time, turn, token, and external-effect limits appropriate to the case.
Report limit interruptions separately rather than interpreting them as semantic failures.

Preserve enough run evidence to reproduce and diagnose material failures.
Do not promote generated outputs into committed fixtures until a human establishes that they represent durable cases rather than incidental model behavior.

## 5. Select and calibrate graders

Select the simplest grader that can reliably observe the accepted requirement at its real boundary.
Prefer deterministic checks for exact state, tool, loading, argument, file, command, and executable outcome claims.
Use model-based graders only for semantic behavior that deterministic evidence cannot adequately distinguish.

Keep trajectory, outcome, interaction-quality, and efficiency results separate.
Do not combine materially different claims into one score when doing so could let success in one dimension hide failure in another.

Treat hard requirements as gates.
A prohibited behavior, unsafe action, invalid outcome, invalid trial configuration, or unavailable decisive evidence cannot be offset by a high average semantic score.

Define semantic rubrics using observable behavior and consequences.
Give score levels anchored examples.
Require the judge to identify the transcript or trajectory evidence supporting each material score.
Do not ask a judge to infer hidden reasoning, user understanding, or facts absent from its evidence.

Calibrate every model-based grader against human-labeled clear passes, clear failures, and difficult boundary cases.
Record grader agreement and inspect disagreements before relying on automated scores.
A grader that cannot distinguish the calibration cases is not accepted for that rubric.

Keep calibration examples separate from ordinary trial outputs.
Version the rubric, grader prompt, judge model, and calibration set.
Do not compare scores from different grader versions unless equivalence has been established.

Blind comparative judges to treatment identity and expected winner.
Randomize response order in pairwise comparisons.
Use order-reversed checks when position bias could affect a consequential result.
Do not reward verbosity, formatting, or agreement with the user unless those qualities are requirements.

Use a judge capable of evaluating the rubric, but do not assume that a larger or newer judge is correct.
Validate judge behavior before optimizing judge cost.
Do not let the evaluated agent grade its own performance within the same trial.

Report grader parse failures, timeouts, missing evidence, and inconsistent judgments separately from behavioral failures.
An unavailable grade is unknown, not zero and not success.

Require human review for new failure clusters, borderline release decisions, grader changes, and proposed removal of model scaffolding.
Automated grading supports engineering judgment but does not replace responsibility for the evaluation contract.

## 6. Repeat trials and report reliability

Treat each execution of a case as a trial.
Run multiple trials whenever model nondeterminism could materially affect the conclusion.
Report trial-level evidence and aggregate results instead of selecting a representative successful response.

Use first-attempt success as the primary reliability measure unless the supported product actually performs retries, generates alternatives, or selects among several attempts.
Do not report pass@k as ordinary capability when users receive only one attempt.

Choose the number of trials from the decision and observed variability.
A small exploratory run may identify obvious failures but must not support a strong reliability or removal claim.
Report uncertainty when the sample is too small to distinguish signal from run-to-run variation.

Define acceptance thresholds before inspecting treatment results.
Derive thresholds from the requirement's consequence and supported use rather than applying one universal percentage.
Critical prohibitions may require every observed trial to pass while still acknowledging that finite trials cannot prove impossibility.

Distinguish capability and regression expectations.
Capability suites may contain difficult cases with low initial pass rates so improvements remain measurable.
Regression suites protect behavior already accepted as reliable and require stronger per-case expectations.

Report results per case and configured model.
A suite average must not hide a consistently failing required case.
Keep hard-gate failures, semantic scores, outcome scores, cost, latency, and token usage separately visible.

Compare control and treatment using absolute quality and treatment effect.
Report the magnitude and uncertainty of the difference, not only which score is larger.
A detectable difference without practical value does not justify scaffolding, and an apparently equal result from too few trials does not justify removal.

Record exact model identifiers when reproducibility matters.
Treat a model release, material harness change, contract revision, grader revision, or case revision as a new evaluation condition.
Do not compare scores across changed conditions without identifying the change.

Investigate inconsistent results before classifying them as model stochasticity.
Separate model variation from fixture contamination, dependency variation, timeout behavior, judge instability, and runner defects.

Preserve failed and borderline trial artifacts.
Do not retain only successful outputs or overwrite prior baselines when rerunning a suite.

## 7. Diagnose failures at the correct boundary

Record these statuses independently:

- Trial validity: `valid` or `invalid`.
- Behavior: `pass`, `fail`, or `unknown`.
- Environment outcome: `pass`, `fail`, `not_applicable`, or `unknown`.
- Grader validity: `valid`, `invalid`, or `challenged`.
- Case validity: `accepted`, `challenged`, or `invalid`.

Derive any primary diagnosis from explicit precedence while preserving every underlying status.
Do not assign a downstream behavior or outcome failure when an earlier invalid or unknown boundary prevents that conclusion.

Use these primary diagnoses:

- `invalid_trial` when the intended experiment did not execute with valid configuration, treatment delivery, fixture, limits, and evidence capture.
- `behavior_failure` when the trial and decisive graders are valid and observed behavior violates the requirement.
- `outcome_failure` when deterministic environment evidence establishes that the required final state was not achieved.
- `grader_failure` when decisive grading is unavailable, invalid, or contradicted by accepted calibration or adjudication.
- `case_failure` only after human review establishes that the case or rubric does not represent the accepted requirement.
- `unresolved` when available evidence cannot distinguish material causes.

Diagnose from the earliest boundary that can explain the result.
Establish that the intended configuration ran before interpreting semantic behavior.
Establish that decisive evidence reached a valid grader before interpreting its score.

Treat a failed eval as evidence requiring diagnosis, not authorization to change the product.
Do not modify instructions, skills, extensions, cases, or graders until evidence identifies the unmet requirement and the component that owns the failure.

Use targeted reruns or ablations when they can distinguish credible causes.
Keep the model, case, and configuration fixed while changing one suspected cause.
Do not repeatedly rerun a failed case until it passes and then discard the failure.

When a state-changing trial returns an uncertain result, inspect resulting state before retrying.
Do not assume timeout, cancellation, or transport failure means the operation did not occur.

Keep findings separate from decisions.
For example, "the agent recommended an owner before inspecting the repository in three trials" is a finding, while "change the learning-mode contract" is a proposed intervention requiring additional evidence.

When a human and calibrated grader disagree on a consequential result, record and adjudicate the disagreement before using the score for release, regression, or removal decisions.
Use `unresolved` when evidence remains insufficient.

## 8. Report results for decisions

A report must identify:

- The evaluation question and accepted requirement.
- Case, trial, model, harness, treatment, and grader versions.
- Trial validity and all independent statuses.
- Any primary diagnosis.
- Hard-gate, semantic, outcome, cost, duration, and limit results.
- Control and treatment distributions when applicable.
- Material trajectory or outcome evidence.
- Uncertainty and unresolved causes.
- The decision the evidence supports or cannot support.

Preserve failed, borderline, and contradictory trials.
Do not report only aggregates or selected examples that hide the failure distribution.
Missing or malformed evidence is unknown, not success or failure.

## 9. Maintain and retire suites deliberately

Admit a case only when it traces to an accepted requirement, identifies a realistic failure, and has an observable grading boundary.
Record its origin, protected requirement, primary failure, supported scope, grader, and admission reason.

Prefer extending an existing case family when a new failure exercises the same underlying behavior.
Create a distinct case when the failure requires materially different evidence or can fail independently.

Separate development, capability, regression, and challenge roles.
Development cases support intervention design.
Capability cases measure current limits.
Regression cases protect behavior already accepted as reliable.
Challenge cases assess transfer beyond repeatedly tuned scenarios.

Do not change product instructions and case expectations together merely to make a failure disappear.
When a requirement changes, record that decision before revising or retiring affected cases.
When only implementation changes, retain the behavior and its cases.

Test suite sensitivity using known-bad examples, rejected prior behavior, control conditions, or targeted instruction ablations.
A grader or case that accepts behavior known to violate its requirement is not protective.
A case that materially different configurations all pass may represent native capability, insufficient difficulty, or a nondiscriminating rubric and requires investigation.

Promote a capability case to regression only after its requirement, fixture, grader, and supported configuration are stable enough for failure to carry release significance.
Record the baseline that justified promotion.

Run relevant regression suites before accepting changes to models, prompts, skills, extensions, tools, context assembly, or graders that can affect protected behavior.
Use broader scheduled runs for expensive capability and challenge suites instead of weakening them solely to reduce routine cost.

Retire an individual case when its protected behavior is no longer required, another accepted case fully subsumes its independent failure, its fixture no longer represents supported use, or its evidence cannot justify its maintenance cost.
Do not remove the last meaningful coverage for a still-required behavior merely because one case is obsolete or expensive.
Record the retirement reason and preserve historical results needed to interpret prior baselines.

Do not retire a behavioral case solely because its original implementation was removed.
Rebind it to the current control or treatment when the behavior remains required.

Periodically review suites for duplicated failures, stale fixtures, uncalibrated graders, saturated cases, unsupported configurations, and costs that no longer justify the information produced.
Evaluation maintenance must remove obsolete complexity as well as add coverage.

## Completion condition

Evaluation work is complete when the named decision has enough valid evidence at the required boundary, every material claim is limited to the tested configuration and uncertainty, and the retained suite protects only accepted behavior with justified maintenance cost.
