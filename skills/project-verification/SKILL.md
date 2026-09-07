---
name: project-verification
description: Use when deciding whether to create project-specific verification guidance, establishing or changing a project's verification approach, or maintaining its verification documentation or skills. Skip routine implementation and running established checks.
---

# Project verification guidance

Capture consequential verification knowledge that future contributors would otherwise need to rediscover.
Do not require every project to have a verification document, skill, or feature map.

## Decide whether guidance is useful

Inspect existing checks, supported interfaces, and relevant project documentation.
Record guidance when contributors could plausibly choose an insufficient or unnecessarily expensive check and existing material does not explain the distinction.
Focus on what needs special verification, what evidence establishes it, and what ordinary checks cannot establish.
Do not duplicate package scripts, generic testing advice, or reports of past runs.
If no useful knowledge is missing, leave the existing arrangement alone.

## Choose its home

Use a section in existing project documentation when that is enough.
Use `VERIFICATION.md` when verification strategy needs a separate, discoverable home.
Use a project-local `verify-<project>` skill when verification needs an on-demand operational recipe for driving the real application or interface.
Give that skill a description naming the relevant surface and when the recipe is needed, rather than invoking it for every change.
Keep each piece of guidance with one owner and link to it instead of maintaining duplicate instructions.

## Write and check the guidance

For an operational recipe, document the applicable setup, launch and readiness checks, interaction steps, observable outcome, limitations, and cleanup.
Use existing supported commands and tools before adding a helper.
Explain instance ownership, credentials, or external effects when they affect safe execution or the validity of the evidence.
Distinguish observing the supported interface from bypassing it through an internal setter or test-only shortcut.
Do not prescribe unrelated checks merely to make the recipe comprehensive.

Exercise newly written operational instructions through the real interface within the task's authorized scope before calling them verified.
If execution is blocked, identify the unverified steps and their prerequisites instead of presenting the recipe as proven.
Clean up task-owned disposable setup without removing intended outputs or unrelated state.

## Maintain it with the behavior

Update affected guidance when an authorized change alters its commands, supported behavior, or verification boundaries.
Distinguish documentation drift from a product regression; do not rewrite the expected result merely to match a bug.
Recheck changed operational steps and any dependent claims their changes invalidate.
Do not require a full feature inventory, fixed delegation pattern, periodic audit, or whole-project live pass by default.
