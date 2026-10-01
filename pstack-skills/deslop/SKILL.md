---
name: deslop
description: >-
  Use before committing code changes or when asked to clean up a code diff.
  Review task-owned changes for unnecessary comments, misplaced defensive
  checks, type-system bypasses, deep nesting, and inconsistencies with local
  style. Prefer focused, behavior-preserving edits.
---

# Remove AI code slop

Review the task-owned code diff against the appropriate review base. Remove unnecessary code introduced by those changes. Do not assume the base branch is named `main`, or clean up unrelated changes.

## Focus areas

- Extra comments that are unnecessary or inconsistent with local style
- Defensive checks or try/catch blocks that are abnormal for trusted code paths
- Casts to `any` used only to bypass type issues
- Deeply nested code that should be simplified with early returns
- Other patterns inconsistent with the file and surrounding codebase

## Guardrails

- Keep behavior unchanged unless fixing a clear bug.
- Prefer minimal, focused edits over broad rewrites.
- If the diff needs no cleanup, leave it unchanged.
- Keep the final summary concise (1-3 sentences).
