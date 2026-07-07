---
name: to-issues
description: "[M] Break a plan, spec, or PRD into local issue drafts using tracer-bullet vertical slices."
disable-model-invocation: true
---

# To Issues

Break a plan into independently-grabbable local issue drafts using vertical slices, also called tracer bullets.

Do not publish externally.

## Process

### 1. Gather context

Work from whatever is already in the conversation context.
If the user passes a local path as an argument, read it.
Do not fetch issue tracker references unless explicitly asked.

### 2. Explore the codebase

If you have not already explored the codebase, do so to understand the current state of the code.
Issue titles and descriptions should use the project's domain glossary vocabulary and respect ADRs in the area you are touching.

Look for opportunities to prefactor the code to make the implementation easier.
Make the change easy, then make the easy change.

### 3. Draft the issues

Break the plan into **tracer bullet** issues, following the **Vertical slice rules**.
A **wide refactor** is the exception to that rule.
Slice wide refactors by **expand-contract** instead.

### 4. Quiz the user

Present the proposed breakdown as a numbered list.
For each slice, show:

- **Title**: short descriptive name
- **Blocked by**: which other slices, if any, must complete first
- **User stories covered**: which user stories this addresses, if the source material has them

Ask the user:

- Does the granularity feel right?
- Are the dependency relationships correct?
- Should any slices be merged or split further?

Iterate until the user approves the breakdown.

### 5. Write local issue drafts

For each approved slice, write a local issue draft using the **Issue body template**.
Order drafts in dependency order, blockers first, so later drafts can reference blocking drafts in the `## Blocked by` section.
If no destination is obvious, ask where to save the drafts.

Do not close or modify any parent issue.

## Reference

### Vertical slice rules

Each issue is a thin vertical slice that cuts through all integration layers end-to-end.
It is not a horizontal slice of one layer.

- Each slice delivers a narrow but complete path through every relevant layer, such as schema, API, UI, and tests.
- A completed slice is demoable or verifiable on its own.
- Any prefactoring should be done first.

### Wide refactors

A **wide refactor** is one mechanical change whose blast radius fans across the whole codebase.
Examples include renaming a column or retyping a shared symbol.
A single edit would break many call sites at once, so no vertical slice can land green.

Do not force a wide refactor into tracer bullets.
Sequence it as **expand-contract** instead.

1. **Expand**: add the new form beside the old form so nothing breaks.
2. **Migrate**: move call sites over in batches sized by blast radius, such as per package or per directory.
   Each batch is its own draft blocked by the expand draft.
   CI stays green batch to batch because the old form still exists.
3. **Contract**: delete the old form once no caller remains.
   This draft is blocked by every migrate batch.

When even the migrate batches cannot stay green alone, keep the sequence but let them share an integration branch.
Have all batches block a final integrate-and-verify draft.
Green is promised only at that final draft.

### Issue body template

<issue-template>
## Parent

A reference to the parent source, if any.
Otherwise omit this section.

## What to build

A concise description of this vertical slice.
Describe the end-to-end behavior, not layer-by-layer implementation.

Avoid specific file paths or code snippets because they go stale fast.
Exception: if the `prototype` skill produced code that encodes a decision more precisely than prose can, add a context pointer to where that prototype code lives rather than inlining it.
Examples include a state machine, reducer, schema, or type shape.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to the blocking draft, if any

Or "None - can start immediately" if no blockers.
</issue-template>
