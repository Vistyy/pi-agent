---
name: eval
description: >-
  Evaluate how changes to agent instructions, prompts, or workflows affect
  agent behavior. Suggest an evaluation when uncertainty about those effects
  matters to a decision. Read this skill only after the user explicitly
  requests or approves an evaluation.
---

# Eval

Compare instruction variants on real tasks before recommending adoption. Evaluate user or project instructions, skill descriptions or bodies, prompts, and agent workflows. Ordinary software tests do not require this skill.

## Check authorization

Confirm that the user explicitly requested or approved this evaluation. Otherwise propose the comparison, its purpose, and expected effort or cost, then stop before preparing environments or launching trials. Permission to create or edit instructions is not permission to evaluate them. Agree on tasks, models, and a run or cost limit before execution.

## Compare variants

1. **Frame the change.** Freeze the baseline, candidate, and exact instruction diff. To assess one rule or related group, change it within the complete instruction set. To assess a revised set, compare the complete old and new sets. Record the decision the comparison should inform.
2. **Define success.** Choose concrete observable outcomes and independent checks before running. Keep subjective criteria in a reviewer-only rubric. Include tasks where the changed guidance matters and ordinary tasks that could regress. If past failures inspired the change, include new tasks beyond those examples. Cover rare safety requirements with targeted cases rather than treating low use as evidence for deletion.
3. **Prepare fresh, isolated runs.** Reuse available native session tools and project verification harnesses. Keep the model, harness, tools, and starting artifacts matched across variants. Vary only the declared instruction or prompt change and keep other task inputs fixed. Verify the effective instruction surface, including discovery and loading when changing a skill. Do not edit live instructions for the comparison. Use neutral working-directory and artifact names. Present each task as an ordinary user request without the rubric, expected solution, experiment framing, or knowledge of other runs.
4. **Run within approval.** Use separate sessions and writable locations for each attempt. Sequential runs are valid. Repeat matched cases within the agreed limit when variability could change the conclusion. Record inputs, settings, actual outputs, usage, and failed or interrupted runs. Do not silently expand the comparison or discard unfavorable results.
5. **Inspect the evidence.** Read every produced artifact and check actual outcomes through supported interfaces. Inspect each run's relevant active-branch transcript for loaded instructions and behavior, not the agent's self-report. Do not search unrelated private histories. If an independent judge is available and authorized, give it sanitized output labels and the same rubric for both sets. Review its verdict yourself. Otherwise report the absence of independent judging.
6. **Recommend, do not auto-apply.** Compare outcomes by task and report measured costs separately from quality. Distinguish supported improvement, regression, no regression detected at lower cost, and insufficient evidence. State coverage and variability limits. No detected effect does not establish that an instruction is useless. User preferences and safety requirements are not decided by a score. Applying the candidate requires separate authorization.

**Reply:** the compared instruction diff, tasks and success criteria, actual results, costs, failed runs, judging method, evidence paths, limitations, and recommendation. If execution is blocked, report the missing evidence instead of claiming the evaluation passed.
