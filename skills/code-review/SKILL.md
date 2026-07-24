---
name: code-review
description: Use when reviewing a bounded branch, task, pull request, or work-in-progress change against its specification and repository standards.
---

# Code Review

Review one bounded diff in two stages:

1. The Spec reviewer checks the approved task and normative specification.
2. The Standards reviewer checks repository standards and long-term design health.

Each stage is either `pending` or `approved`.
An approved stage stays approved for the current review lifecycle.
Every finding still requires a correction or an approved routing decision.

## 1. Set the review scope

Record the repository path, fixed point, and task path.

- Use the fixed point supplied by the user.
- If the user did not supply a fixed point, ask for it.
- Resolve the fixed point with `git rev-parse` and record the full commit SHA.
- Confirm that `git diff <fixed-point>...HEAD` is not empty.
- Use the task path supplied by the user.
- Otherwise, inspect commit messages and local task documents for a matching task.
- If no task matches the diff, ask for the task path.
- For GitHub references, use `gh-axi` through `pnpx -y gh-axi ...`.

The repository path, fixed-point SHA, and task path identify one review lifecycle.
Set both stages to `pending` when any of these values changes.
Also start a new lifecycle when the user requests one.

This step is complete when the review scope is valid and each stage has a recorded state.

## 2. Keep one reviewer session for each stage

Assign one unique agent task name to the Spec stage and one to the Standards stage.
Keep each task name for the complete review lifecycle.

For the first review in a stage:

1. Call `spawn_agent` with the stage task name and the matching reviewer `agent_type`.
2. Call `wait_agent` with the same task name.

If a stage remains `pending` after corrections:

1. Call `send_message` for the existing reviewer task.
2. Include the current review request, correction summary, and validation evidence.
3. Call `wait_agent` with the same task name.

A continued reviewer reuses repository orientation, but it makes a new judgment over the current `HEAD`.
Do not replace a pending reviewer with a fresh agent.

This step is complete when the reviewer returns one complete report for the current `HEAD`.

## 3. Run the Spec review

If the Spec stage is `pending`, send this request to `spec-reviewer`:

```text
Repository: <repository path>
Fixed point: <full commit SHA>
Task: <task path>
Review the current HEAD according to your identity.
```

For a continued Spec review, append the correction summary and validation evidence.

Handle the returned status:

- `BLOCKED`: Keep both stages `pending` and return the complete report for correction.
- `APPROVED WITH REQUIRED COMMENTS`: Mark Spec as `approved`, keep Standards `pending`, and return the complete report for correction.
- `APPROVED`: Mark Spec as `approved` and continue to Standards.
- `INVALID REVIEW REQUEST`: Keep both stages `pending`, correct the request, and retry.
- Missing or unknown status: Keep both stages `pending` and retry with the required fields.

Apply and validate every Spec finding before running Standards.
Do not run Spec again after it is approved in the current lifecycle.

This step is complete when Spec needs corrections or Standards may begin.

## 4. Run the Standards review

Run Standards only when Spec is approved and every Spec finding is corrected and validated.

If the Standards stage is `pending`, send this request to `standards-reviewer`:

```text
Repository: <repository path>
Fixed point: <full commit SHA>
Review the current HEAD according to your identity.
```

If the diff changes quality policy, include the user's explicit approval of that specific change.
For a continued Standards review, append the correction summary and validation evidence.

Handle the returned status:

- `BLOCKED`: Keep Standards `pending` and return the complete report for correction.
- `APPROVED WITH REQUIRED COMMENTS`: Mark Standards as `approved` and return every required correction.
- `APPROVED`: Mark Standards as `approved`.
- `INVALID REVIEW REQUEST`: Keep Standards `pending`, correct the request, and retry.
- Missing or unknown status: Keep Standards `pending` and retry with the required fields.

Do not run Standards again after it is approved in the current lifecycle.
Apply every finding, including findings returned with an approval status.

This step is complete when Standards needs corrections or is approved.

## 5. Report the result

Present each report produced in the current invocation under `## Spec` or `## Standards`.
If an approved stage did not run, report its saved state as `approved`.
If Standards has not run, report it as `pending` and state what must happen first.
Preserve every reviewer finding without merging, dismissing, reranking, or softening it.

End with both stage states and the required next action.
Rerun only a `pending` stage.
Finish the lifecycle when both stages are `approved`, every finding is resolved, and required validation passes.
