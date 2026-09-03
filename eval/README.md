# Skill evaluation

This directory measures whether Pi skills materially improve observable behavior enough to justify their cost and maintenance.
It replaces the removed general-purpose behavioral harness with a smaller paired-comparison runner.

## Evaluation model

A case names one decision, one organic task, an observable boundary, and explicit criteria.
Every evaluated model runs both the control and treatment conditions against the same sanitized repository snapshot.
The configured model, thinking level, tools, repository revision, prompt, and limits remain fixed within each pair.
Only the available and invoked skill changes.

The initial treatment uses the exact adapted P-Stack skill copied under `candidates/`.
`catalog.json` records its source commit and digest.
A copied skill is staged under an unrelated temporary path before execution so the candidate cannot infer that another condition exists.

Deterministic repository and trajectory evidence remains separate from semantic review.
A deterministic failure cannot be offset by a favorable prose judgment.
A model judge is not accepted until its rubric distinguishes reviewed calibration examples.

## Commands

Validate the catalog, candidate provenance, case definitions, graders, and source revisions.

```bash
node eval/check.mjs
```

Inspect a randomized execution plan without making model calls.

```bash
node eval/run.mjs --case but-why-create-verification --plan
```

Run the case's initial crossed comparison.

```bash
node eval/run.mjs --case but-why-create-verification
```

Restrict an exploratory run when diagnosing the harness.

```bash
node eval/run.mjs \
  --case but-why-create-verification \
  --models luna-high \
  --candidates pstack-create-verification \
  --trials 1
```

Re-run deterministic grading after changing a grader without making model calls.

```bash
node eval/regrade.mjs eval/runs/<run-directory>
```

Summarize a completed run.

```bash
node eval/summarize.mjs eval/runs/<run-directory>
```

Raw run artifacts are ignored by Git.
Each run retains the exact configuration, transcript, output, repository status, produced `.pi` files, deterministic grade, actual model identifiers, token usage, recorded cost, and duration.

## Trial validity

A trial is valid only when the requested process completes within its limit, the actual model matches the configured model, the treatment is present when required, the transcript is readable, and the grader returns valid evidence.
Invalid delivery or execution is not a behavioral failure.
The runner uses Pi RPC mode because print mode does not expand skill commands.
It verifies that the requested skill command is registered before making a model call and that Pi expanded the exact skill into the first user message afterward.

The runner disables ambient skills, extensions, and prompt templates for isolated attribution.
The normal global and repository instructions still apply equally to control and treatment.
Later integrated trials must evaluate qualifying skills inside the intended complete Pi setup.

## Admission and stopping

Begin with one control and one treatment trial on Luna and Sol.
Stop early when the skill produces no material behavioral difference while adding material cost.
Add trials when results differ, the grader is challenged, or observed variation could change the decision.
Do not infer reliable equivalence or justify skill removal from one paired run.

A skill qualifies for portfolio consideration only when it improves an accepted outcome or protects a realistic important failure without a disproportionate regression in another required behavior.
Routing accuracy and permanent description cost are evaluated separately before installation as a model-invoked skill.

## Planned sequence

1. Validate the runner with the project-verification creation case.
2. Add maintenance and task-level evidence cases for the verification family.
3. Evaluate understanding and evidence skills.
4. Evaluate task playbooks by task class.
5. Evaluate code and prose cleanup.
6. Evaluate orchestration only after its component capabilities qualify.
7. Evaluate automatic routing and the integrated winning portfolio.
8. Consolidate or remove skills only when comparative evidence supports the change.
