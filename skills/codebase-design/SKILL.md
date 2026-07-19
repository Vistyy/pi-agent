---
name: codebase-design
description: Use when designing or improving a module's interface, finding deepening opportunities, placing a seam, improving testability, making a codebase easier for agents to navigate, or when another skill needs the deep-module vocabulary.
---

# Codebase Design

Design deep modules.
A deep module provides substantial behavior through a small interface.
Place its interface at a clear seam and test the module through that interface.

Use this vocabulary for architectural claims.
Use each term with the meaning defined here.

## Vocabulary

**Module**: Anything that has an interface and an implementation.
A module can be a function, class, package, or tier-spanning slice.
_Avoid_: unit, component, service.

**Interface**: Everything a caller must know to use a module correctly.
The interface includes type signatures, invariants, ordering constraints, error modes, configuration, and performance characteristics.
_Avoid_: API, signature.

**Implementation**: The code inside a module.
Use **Adapter** when the role at a seam is the subject.
Use **Implementation** when the code inside the module is the subject.

**Depth**: The amount of behavior that a caller or test can exercise for each part of the interface it must learn.
A deep module provides substantial behavior through a small interface.
A shallow module has an interface that is nearly as complex as its implementation.

**Seam**: A location where behavior can change without editing that location.
A seam is the location where a module exposes its interface.
_Avoid_: boundary.

**Adapter**: A concrete implementation that satisfies an interface at a seam.
Adapter describes the role that the implementation performs, not its code shape.

**Leverage**: The capability that callers receive for each part of an interface that they must learn.
One implementation can provide leverage to many callers and tests.

**Locality**: The concentration of behavior, knowledge, defects, and verification in one module.
Locality lets maintainers make and verify a change in one place.

## Compare deep and shallow modules

A deep module has a small interface and a substantial implementation:

```
┌─────────────────────┐
│   Small Interface   │  <- Few methods, simple params
├─────────────────────┤
│                     │
│  Deep Implementation│  <- Complex logic hidden
│                     │
└─────────────────────┘
```

A shallow module has a large interface and a small implementation:

```
┌─────────────────────────────────┐
│       Large Interface           │  <- Many methods, complex params
├─────────────────────────────────┤
│  Thin Implementation            │  <- Just passes through
└─────────────────────────────────┘
```

When you design an interface, ask:

- Can the interface have fewer methods?
- Can the parameters be simpler?
- Can the implementation hide more complexity?

## Apply the design principles

### Measure depth at the interface

Depth is a property of the module's interface.
A deep module can contain small internal parts without exposing them.
Its implementation can have internal seams for tests of those private modules.
Tests of the deep module's external behavior use its external interface.

### Apply the deletion test

Imagine that you delete the module.
If complexity disappears, the module was a pass-through.
If complexity moves into multiple callers, the module was providing locality.

### Test through the interface

Callers and tests use the same interface.
If a test must bypass the interface, reconsider the module shape.

### Require a real seam

One adapter makes a seam hypothetical.
Two adapters make a seam real.
Introduce a seam when behavior actually varies at that location.

## Design for testability

### Accept dependencies

```typescript
// Testable
function processOrder(order, paymentGateway) {}

// Hard to test
function processOrder(order) {
  const gateway = new StripeGateway();
}
```

### Return results instead of producing side effects

```typescript
// Testable
function calculateDiscount(cart): Discount {}

// Hard to test
function applyDiscount(cart): void {
  cart.total -= discount;
}
```

### Keep the interface small

Fewer methods reduce the interface that callers and tests must learn.
Simpler parameters reduce test setup.

## Preserve these relationships

- A **Module** has one **Interface**.
- **Depth** is a property of a module, measured through its interface.
- A **Seam** is the location where a module exposes its interface.
- An **Adapter** satisfies an interface at a seam.
- **Depth** provides **Leverage** for callers and **Locality** for maintainers.

## Rejected definitions

- Measuring **Depth** as implementation lines divided by interface lines rewards unnecessary implementation.
- Defining **Interface** as only a TypeScript `interface` or public method list omits required behavior and constraints.
- Using **Boundary** for **Seam** conflicts with the DDD term bounded context.

## Apply the supporting guidance

- For dependency categories, seam discipline, and test replacement, read [DEEPENING.md](DEEPENING.md).
- For independent alternative interfaces, read [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md).
