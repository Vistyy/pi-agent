---
name: domain-modeling
description: Use when defining domain terms, resolving inconsistent or vague terminology, testing relationships between domain concepts, verifying domain statements against code, or maintaining the domain model in CONTEXT.md or ADRs.
---

# Domain Modeling

Define terms, test relationships, and record resolved decisions.
Reading `CONTEXT.md` without changing the model does not require this skill.

## Find the applicable context

If `CONTEXT-MAP.md` exists at the repository root, use it to find each context.
If neither a root map nor a root `CONTEXT.md` exists, locate existing nested `CONTEXT.md` files before assuming that the repository has no domain model.
When nested or multiple contexts exist without a root map, report the structure gap and ask which context owns the current topic when ownership is unclear.

Before changing the domain model, inspect the applicable repository instructions, the selected `CONTEXT.md`, and existing ADRs.
If `CONTEXT-MAP.md` exists, inspect the root `docs/adr/` and the selected context's `docs/adr/`.
Otherwise, inspect the root `docs/adr/` when it exists.

When distinct domain language or rules suggest a second context, read [Introduce a second context](references/CONTEXT-FORMAT.md#introduce-a-second-context).

Context discovery is complete when each affected term and decision has one owning context.

## Maintain the model during the session

### Choose natural terms

Start with words that users and maintainers already use.
Prefer the shortest familiar term that distinguishes the concept.
Do not add names such as Authority, Manager, Service, Engine, Coordinator, or System unless they identify a separate concept that users must name.
For example, prefer "Orders own these rules" to "Order Authority owns these rules", and prefer "payment coordination" to "Payment Composition Service".
If a user would not naturally use the proposed term, choose a simpler term or ask the user.
Preserve an established canonical term until the applicable authority approves its replacement.

### Resolve inconsistent terms

If the user uses a term that conflicts with the applicable `CONTEXT.md`:

1. State the existing definition.
2. State how the user's meaning differs.
3. Ask which meaning is correct.

### Clarify vague terms

If a term has multiple possible meanings, identify the possible concepts.
Propose one canonical term for each concept and ask the user to confirm it.

### Test domain relationships

When the user describes a relationship between concepts, test it with specific scenarios.
Include edge cases that clarify the boundary between each concept.
Ask the user to resolve any ambiguous result.

Relationship testing is complete when normal and boundary scenarios produce an unambiguous relationship.
If ambiguity remains, keep the affected model change incomplete until the user resolves it.

### Verify statements against the code

When the user states how the domain works, inspect the applicable code.
If the code and the statement conflict:

1. Describe the behavior in the code.
2. Describe the conflicting statement.
3. Ask which behavior defines the current domain model.

Code verification is complete when the applicable implementation agrees with the domain statement or the user resolves each identified conflict.

### Record resolved terms

Use each `CONTEXT.md` only for the implemented, supported domain model in its scope.
Keep a term for planned functionality in the applicable plan or Task until that functionality is implemented.
Plan approval does not make the term part of the current domain model.

After implementation, update the applicable `CONTEXT.md` only when the user has authorized that domain-model edit.
Otherwise, report the proposed canonical definition, owning context, implementation status, and authorization needed to record it.
Use [CONTEXT-FORMAT.md](references/CONTEXT-FORMAT.md).

Record specifications and implementation details in the applicable technical documentation.

Term handling is complete when an implemented authorized definition is recorded in its owning `CONTEXT.md`, or when the unrecorded proposed definition, owning context, implementation status, and needed authorization are explicit.

### Offer an ADR

When a decision may require an ADR, load [ADR-FORMAT.md](references/ADR-FORMAT.md).
Apply its qualification and lifecycle rules before creating or changing an ADR.

Keep an accepted decision for planned functionality in the applicable plan or Task until implementation.
ADR evaluation is complete when an implemented qualifying decision is recorded in an applicable authorized artifact without duplicating an existing authority, or when its implementation status and needed authorization are explicit.
