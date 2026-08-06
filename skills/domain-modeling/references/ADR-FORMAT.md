# ADR Format

An ADR records an accepted architectural decision that is stable enough to guide implementation.
Keep proposals and unresolved choices in the applicable task, specification, or open-questions document.

## Decide whether an ADR is required

Before creating an ADR, inspect the applicable repository instructions, `CONTEXT.md`, and existing ADRs.
Create an ADR only when evidence supports all three conditions:

1. **Hard to reverse**: Changing the decision later has a meaningful replacement, migration, or compatibility cost.
2. **Surprising without context**: A future maintainer needs the reason because the implementation does not explain the choice.
3. **Real trade-off**: The decision selects one valid architectural option over another.

Evaluate reversal cost against the project's current lifecycle.
Planned or unimplemented behavior in unreleased software is normally easy to reverse.

A configuration field, schema member, module split, implementation detail, or sequencing choice does not qualify by category alone.
Record it in the applicable task or specification unless the decision itself satisfies all three conditions.
Do not create an ADR when an existing ADR already owns the rationale.

This step is complete when each condition has concrete evidence and no existing ADR owns the decision.

## Maintain existing ADRs

Amend an ADR when the governing decision remains the same.
Supersede an ADR only when the governing decision changes and the old record remains useful for supported history.
Update active references when an ADR is renamed, removed, or superseded.

When repository policy permits removal, delete a stale pre-release ADR instead of preserving it as documentation sediment.

This step is complete when one active ADR owns the decision and every active reference points to it.

## Store and number ADRs

Store each ADR in the `docs/adr/` directory for the scope that owns the decision.
Use the root `docs/adr/` for system-wide decisions.
Use a context's `docs/adr/` for context-specific decisions.
Create the applicable directory when the first qualifying ADR is accepted.

For a new ADR, scan the applicable directory for the highest existing number and increment it.
Use sequential filenames such as `0001-event-sourced-orders.md`.
Do not renumber existing ADRs only to close gaps.

This step is complete when the ADR uses the owning scope and the next stable number.

## Write the ADR

Use this minimum form:

```md
---
status: accepted
---

# {Short title of the decision}

{State the context, decision, and reason in one to three sentences.}
```

Set the frontmatter status to `accepted`, `deprecated`, or `superseded by ADR-NNNN`, as applicable.

Add a section only when a future maintainer needs it:

- **Considered Options** records important rejected alternatives.
- **Consequences** records non-obvious downstream effects.

The ADR is complete when it states one qualifying decision, preserves only necessary rationale, and contains no task plan or implementation checklist.
