---
name: domain-modeling
description: Use when defining domain terms, resolving inconsistent terminology, testing relationships between domain concepts, recording domain decisions, maintaining a project's domain model, or when another skill needs to maintain the domain model.
---

# Domain Modeling

Use this skill when you change a project's domain model.
Use it to define terms, test relationships, and record resolved decisions.
Reading `CONTEXT.md` without changing the model does not require this skill.

## Find the applicable context

Most repositories have one context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If `CONTEXT-MAP.md` exists at the repository root, the repository has multiple contexts.
Use the map to find each context:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files when you have content to record.
Create the applicable `CONTEXT.md` when the user resolves the first term.
Create the applicable `docs/adr/` when the first ADR is required.
Use the root locations for system-wide decisions and a context's locations for context-specific decisions.

When distinct domain language or rules suggest a second context, read [Introduce a second context](./CONTEXT-FORMAT.md#introduce-a-second-context).
Ask the user to confirm the split before changing files.

## Maintain the model during the session

### Resolve inconsistent terms

If the user uses a term that conflicts with the applicable `CONTEXT.md`:

1. State the existing definition.
2. State how the user's meaning differs.
3. Ask which meaning is correct.

Example:

> The applicable `CONTEXT.md` defines cancellation as X, but you appear to mean Y.
> Which meaning is correct?

### Clarify vague terms

If a term has multiple possible meanings, identify the possible concepts.
Propose one canonical term for each concept.

Example:

> Does `account` refer to the Customer or the User?
> These terms identify different concepts.

### Test domain relationships

When the user describes a relationship between concepts, test it with specific scenarios.
Include edge cases that clarify the boundary between each concept.
Ask the user to resolve any ambiguous result.

### Verify statements against the code

When the user states how the system works, inspect the applicable code.
If the code and the statement conflict:

1. Describe the behavior in the code.
2. Describe the conflicting statement.
3. Ask which behavior defines the current domain model.

Example:

> The code cancels an entire Order.
> You stated that partial cancellation is possible.
> Which behavior is correct?

### Record resolved terms

Update the applicable `CONTEXT.md` immediately after the user resolves a term.
Use [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

Use each `CONTEXT.md` only for domain terms and definitions in its scope.
Record specifications and implementation details in the applicable technical documentation.
Record qualifying architectural decisions as ADRs.

### Offer an ADR

Offer to create an ADR only when all three conditions apply:

1. **Hard to reverse**: Changing the decision later has a meaningful cost.
2. **Surprising without context**: A future reader will need the reason for the decision.
3. **Real trade-off**: The decision selected one option from multiple valid alternatives.

If all conditions apply, use [ADR-FORMAT.md](./ADR-FORMAT.md).
