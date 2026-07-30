# `CONTEXT.md` Format

## Structure

```md
# {Context Name}

{Describe the context and its purpose in one or two sentences.}

## Language

**Order**:
{Define the term in one or two sentences.}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
```

## Define the language

- Select one canonical term for each concept.
- List alternative terms under `_Avoid_`.
- Define each term in one or two sentences.
- Define what the term identifies.
- Include only concepts that are specific to the project context.
- Group terms under subheadings when natural groups appear.
- Use a flat list when all terms belong to one group.

Before you add a term, confirm that it identifies a project-specific concept.
Keep general programming concepts in the applicable technical documentation.

## Select the repository structure

A repository with one context has one `CONTEXT.md` at its root.

A repository with multiple contexts has a root `CONTEXT-MAP.md`.
The map lists each context, its location, and its relationships:

```md
# Context Map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md) - receives and tracks customer orders
- [Billing](./src/billing/CONTEXT.md) - generates invoices and processes payments
- [Fulfillment](./src/fulfillment/CONTEXT.md) - manages warehouse picking and shipping

## Relationships

- **Ordering → Fulfillment**: Ordering emits `OrderPlaced` events; Fulfillment consumes them to start picking
- **Fulfillment → Billing**: Fulfillment emits `ShipmentDispatched` events; Billing consumes them to generate invoices
- **Ordering ↔ Billing**: Shared types for `CustomerId` and `Money`
```

Use these rules to select the structure:

- If `CONTEXT-MAP.md` exists, read it to find the applicable context.
- If only a root `CONTEXT.md` exists, use the root context.
- If neither file exists, create a root `CONTEXT.md` when the user resolves the first term.

When multiple contexts exist, identify the context for the current topic.
If the applicable context is unclear, ask the user.

## Introduce a second context

Create a second context only when two areas use distinct domain language or rules that must remain independent.
Separate directories or modules do not establish separate contexts.
When the evidence suggests a second context, state the distinct language or rules and ask the user to confirm the split.

After the user confirms the split:

1. Ask the user to confirm each context's canonical name, purpose, and repository location.
2. Create each context-specific `CONTEXT.md` with its confirmed name and purpose.
3. Move each term from the root `CONTEXT.md` to its applicable context.
4. If a term's context is ambiguous, ask the user to resolve it before continuing the transition.
5. Keep the root `CONTEXT.md` until every term has an applicable context.
6. Create the root `CONTEXT-MAP.md`.
7. Record each context's location and its relationships with other contexts.
8. Remove the root `CONTEXT.md` after every term has moved.

Update `CONTEXT-MAP.md` immediately when a context or relationship changes.
The transition is complete when the map links every context, each term has one applicable context, and every known cross-context relationship is recorded.
