# ADR Format

Store each ADR in the `docs/adr/` directory for the scope that owns the decision.
Use the root `docs/adr/` for system-wide decisions.
Use a context's `docs/adr/` for decisions owned by that context.
Use sequential filenames such as `0001-slug.md` and `0002-slug.md` within that directory.
Create the applicable directory when its first ADR is required.

## Template

```md
# {Short title of the decision}

{In one to three sentences, state the context, decision, and reason.}
```

A single paragraph is sufficient when it records the decision and its reason.

## Optional sections

Include an optional section only when it adds information that a future reader will need.

- **Status** frontmatter: Use `proposed`, `accepted`, `deprecated`, or `superseded by ADR-NNNN` when a decision can change status.
- **Considered Options**: Record rejected alternatives when their rejection is important.
- **Consequences**: Record downstream effects that are not obvious.

## Select the number

Scan the applicable `docs/adr/` for the highest existing number.
Increment that number by one.

## Offer an ADR

Offer an ADR only when all three conditions apply:

1. **Hard to reverse**: Changing the decision later has a meaningful cost.
2. **Surprising without context**: A future reader will need the reason for the decision.
3. **Real trade-off**: The decision selected one option from multiple valid alternatives.

## Qualifying decisions

The following decisions commonly qualify when all three conditions apply:

- **Architectural shape**: Record a persistent system structure, such as a monorepo or an event-sourced write model.
- **Integration pattern**: Record how contexts communicate, such as domain events instead of synchronous HTTP.
- **Technology lock-in**: Record a technology choice that would have a significant replacement cost.
- **Boundary and scope**: Record which context owns data or behavior and how other contexts can use it.
- **Deliberate deviation**: Record a non-obvious choice, such as manual SQL instead of an ORM.
- **Invisible constraint**: Record a requirement that the code does not show, such as a compliance or latency constraint.
- **Rejected alternative**: Record a non-obvious rejection that a future reader could reasonably propose again.
