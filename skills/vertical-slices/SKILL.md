---
name: vertical-slices
description: Use when decomposing approved requirements into vertical tasks or routing work discovered during implementation.
---

# Vertical Slices

Use more than one Task only when the work contains more than one independently acceptable supported result.
A supported result leaves the repository safe and usable and can be accepted without completion of the later results.

Do not create a complete Task graph, requirement allocation, review-path inventory, or standard Task Context structure by default.
Do not split work merely by files, modules, layers, commands, test categories, implementation steps, or effort.
Do not combine independently useful outcomes only to reduce Task count.
Keep work together when an intermediate state has no independent value or would leave the system unsupported.

Describe each Task clearly enough to communicate its outcome and consequential constraints.
Use prior implementation evidence when it materially changes a boundary, but do not require a failed-attempt history or matrix.
Add a Task Dependency only when one Task cannot be implemented or verified until another Task is complete.

When implementation discovers work that is necessary for the accepted outcome and does not change that outcome, keep it in the current Task.
Stop for authority only when the discovered work changes accepted intent, creates a genuinely separate supported outcome, or makes safe completion impossible.
Preserve completed work when authority is required.

When evidence shows that old and new forms must coexist during a migration, read [Expand-Contract](references/EXPAND-CONTRACT.md).
Do not load that reference merely because a change replaces one representation with another.
