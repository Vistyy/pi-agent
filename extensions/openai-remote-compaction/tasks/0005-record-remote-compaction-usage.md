# Remote compaction usage is visible

Status: Complete

Completion evidence:

- Implementation commits: `e82b568`, `094d2b2`
- Verification: extension tests, extension typecheck, pi-cost tests, and pi-cost typecheck
- Review: Spec approved and Standards approved

## Specification

[OpenAI Remote Compaction Specification](../SPEC.md)

## Behaviors owned

- Persist OpenAI usage in `CompactionEntry.usage` through `Usage accounting`.
- Append the shared `pi.usage.recorded` schema after Pi saves remote compaction.

## What to build

Deliver usage accounting through Pi's standard compaction field and the shared extension usage record.

## Primary verification seam

The saved session branch after `session_compact`.

## Acceptance criteria

- [ ] Standard Pi compaction usage contains normalized remote response usage.
- [ ] A successful remote compaction appends one schema-version-1 `pi.usage.recorded` entry.
- [ ] The custom entry identifies the extension, operation, provider, and model.
- [ ] Failed and ordinary Pi compactions do not append a remote usage record.

## Blocked by

- [Task 0001](./0001-preserve-remote-checkpoint.md)
