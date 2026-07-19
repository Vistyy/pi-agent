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
