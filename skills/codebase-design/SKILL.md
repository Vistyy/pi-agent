---
name: codebase-design
description: Use when designing or improving a module's interface, finding deepening opportunities, placing a seam, improving testability, making a codebase easier for agents to navigate, or when another skill needs the deep-module vocabulary.
---

# Codebase Design

Design deep modules: substantial behavior behind a small interface.
Place the interface at a clear seam.
Test the module through that interface.

Use the following terms only with these meanings.

## Canonical vocabulary

**Module**: Anything with an interface and an implementation, including a function, class, package, or tier-spanning slice.
Use **Module** instead of *unit*, *component*, or *service*.

**Interface**: Everything a caller must know to use a module correctly.
The interface includes type signatures, invariants, ordering constraints, error modes, configuration, and performance characteristics.
Use **Interface** instead of *API* or *signature*.

**Implementation**: Code inside a module.
When describing a role at a seam, use **Adapter**.
When describing code inside the module, use **Implementation**.

**Depth**: The behavior a caller or test can exercise for each part of the interface it must learn.
A deep module provides substantial behavior through a small interface.
A shallow module's interface is nearly as complex as its implementation.

**Seam**: A location where behavior can change without editing that location.
A module exposes its interface at a seam.
Use **Seam** instead of *boundary*.

**Adapter**: A concrete implementation that satisfies an interface at a seam.
The term describes the role, not the code shape.

**Leverage**: The capability callers receive for each part of the interface they must learn.
One implementation can provide leverage to many callers and tests.

**Locality**: The concentration of behavior, knowledge, defects, and verification in one module.
Locality lets maintainers make and verify a change in one place.

## Apply the design rules

### Measure depth at the interface

Judge depth by the module's interface rather than implementation size.
Internal parts may be small.
The implementation may have internal seams for private-module tests.
Test the deep module's external behavior through its external interface.

### Apply the deletion test

Imagine deleting the module.
If complexity disappears, the module was a pass-through.
If complexity moves into multiple callers, the module provided locality.

### Test through the interface

Callers and tests must use the same interface.
If a test bypasses the interface, reconsider the module shape.

### Require a real seam

One adapter makes a seam hypothetical.
Two adapters make a seam real.
When behavior varies at a location, introduce a seam there.

### Design for testability

Accept dependencies instead of constructing them inside the module:

```typescript
function processOrder(order, paymentGateway) {}
```

Return results instead of producing side effects:

```typescript
function calculateDiscount(cart): Discount {}
```

Keep the interface small.
Fewer methods reduce what callers and tests must learn.
Simpler parameters reduce test setup.

When reviewing an interface, ask:

- Can the interface have fewer methods?
- Can the parameters be simpler?
- Can the implementation hide more complexity?

## Preserve these relationships

- A **Module** has one **Interface**.
- **Depth** is a property of a module, measured through its interface.
- A **Seam** is where a module exposes its interface.
- An **Adapter** satisfies an interface at a seam.
- **Depth** provides **Leverage** for callers and **Locality** for maintainers.

## Reject invalid definitions

- **Depth** is not implementation lines divided by interface lines because that measure rewards unnecessary implementation.
- **Interface** includes required behavior and constraints, not only a TypeScript `interface` or public method list.
- Use **Seam** for a changeable behavior location because *boundary* conflicts with the DDD term bounded context.

## Apply supporting guidance

When designing dependency categories, seams, or test replacement, read [DEEPENING.md](DEEPENING.md).
When the user requests independent alternative interfaces, read [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md).
