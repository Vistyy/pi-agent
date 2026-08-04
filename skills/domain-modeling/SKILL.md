---
name: domain-modeling
description: Use when defining domain terms, resolving inconsistent terminology, testing relationships between domain concepts, recording domain decisions, maintaining a project's domain model, or when another skill needs to maintain the domain model.
---

# Domain Modeling

Define terms, test relationships, and record resolved decisions.
Reading `CONTEXT.md` without changing the model does not require this skill.

## Find the applicable context

Most repositories have one context.
If `CONTEXT-MAP.md` exists at the repository root, the repository has multiple contexts.
Use the map to find each context.

Before changing the domain model, inspect the applicable repository instructions, `CONTEXT.md`, and existing ADRs.
If `CONTEXT-MAP.md` exists, inspect the root `docs/adr/` and the selected context's `docs/adr/`.
Otherwise, inspect the root `docs/adr/` when it exists.

Create the applicable `CONTEXT.md` when the user resolves the first domain term.
Create an ADR only after the user accepts a decision that qualifies under [ADR-FORMAT.md](references/ADR-FORMAT.md).
Use the root locations for system-wide decisions and a context's locations for context-specific decisions.

When distinct domain language or rules suggest a second context, read [Introduce a second context](references/CONTEXT-FORMAT.md#introduce-a-second-context).
Ask the user to confirm the split before changing files.

Context discovery is complete when each affected term and decision has one owning context and applicable instruction set.

## Maintain the model during the session

### Resolve inconsistent terms

If the user uses a term that conflicts with the applicable `CONTEXT.md`:

1. State the existing definition.
2. State how the user's meaning differs.
3. Ask which meaning is correct.

### Clarify vague terms

If a term has multiple possible meanings, identify the possible concepts.
Propose one canonical term for each concept.

### Test domain relationships

When the user describes a relationship between concepts, test it with specific scenarios.
Include edge cases that clarify the boundary between each concept.
Ask the user to resolve any ambiguous result.

Relationship testing is complete when normal and boundary scenarios produce an unambiguous relationship.
If ambiguity remains, keep the affected model change incomplete until the user resolves it.

### Verify statements against the code

When the user states how the system works, inspect the applicable code.
If the code and the statement conflict:

1. Describe the behavior in the code.
2. Describe the conflicting statement.
3. Ask which behavior defines the current domain model.

Code verification is complete when the applicable implementation agrees with the domain statement or the user resolves each identified conflict.

### Record resolved terms

Update the applicable `CONTEXT.md` immediately after the user resolves a term.
Use [CONTEXT-FORMAT.md](references/CONTEXT-FORMAT.md).

Use each `CONTEXT.md` only for domain terms and definitions in its scope.
Record specifications and implementation details in the applicable technical documentation.
Record qualifying architectural decisions as ADRs.

Term recording is complete when each resolved term has one canonical definition in its owning `CONTEXT.md`.

### Offer an ADR

When a decision may require an ADR, load [ADR-FORMAT.md](references/ADR-FORMAT.md).
Apply its qualification and lifecycle rules before creating or changing an ADR.

ADR evaluation is complete when the accepted decision is recorded in the smallest qualifying artifact without duplicating an existing authority.
