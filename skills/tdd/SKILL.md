---
name: tdd
description: Use when implementing a feature or defect fix test-first, applying red-green-refactor, or writing integration tests.
---

# Test-Driven Development

Use a red -> green loop to produce tests that remain useful after implementation changes.
Apply these rules during every cycle.

## Prepare the context

Before writing tests, check for `CONTEXT-MAP.md`.
If `CONTEXT-MAP.md` exists, read it.
Use the map to select the applicable context.
If the map does not exist and the root `CONTEXT.md` exists, read the root context.
Read the ADRs for the applicable scope.
Use the applicable domain terms in test names and interface vocabulary.

For test examples, read [tests.md](tests.md).
For mocking rules, read [mocking.md](mocking.md).

## Test observable behavior

Test behavior through a public interface.
A test must state a capability that a caller can observe.
The test must remain valid when internal structure changes without changing that capability.

Example test name:

> User can checkout with a valid cart.

## Select public seams

A **seam** is a public interface where a test observes behavior without accessing internal state.

Before writing a test:

1. Identify the behavior that the test must prove.
2. Identify the public interfaces that expose that behavior.
3. Select the narrowest public interface that observes the complete behavior reliably.

### Layered seams

- Prove critical acceptance paths with a small number of tests at the highest practical public seam.
- Test behavior variations at the lowest public seam that observes them reliably.
- Verify external contracts at adapter seams.

Use expensive environment setup only when that integration is part of the behavior under test.

## Reject test anti-patterns

### Implementation-coupled tests

An implementation-coupled test accesses internal behavior.
Examples include mocking internal collaborators, testing private methods, or querying a database instead of using the public interface.

A test is implementation-coupled when an internal refactor changes it without changing observable behavior.

### Tautological tests

A tautological test calculates its expected value with the same logic as the implementation.
It passes by construction.

Take expected values from an independent source such as a known literal, worked example, or specification.
Examples include:

- `expect(add(a, b)).toBe(a + b)`.
- A snapshot created with the same algorithm as the implementation.
- A constant asserted equal to itself.

### Horizontal slicing

Horizontal slicing writes a batch of tests before any implementation.
The batch encodes assumed behavior before implementation provides evidence.

Use vertical cycles instead:

1. Write one failing test.
2. Write the minimum implementation that passes it.
3. Use the result to select the next observable behavior.

Each test is a **tracer bullet** through one public seam.

## Run each cycle

### Red before green

Write one failing test first.
Run the test.
Confirm that it fails for the expected reason.

### Implement one slice

Write only the code required to pass the current test.
Add no behavior for a future test.

### Confirm green

Run the current test.
Run the relevant existing tests.
Confirm that both pass.

### Continue from evidence

Select the next test from the remaining required behavior and the completed cycle's evidence.
Repeat one test -> one implementation until the required behavior is complete.

During review, perform structural refactoring with the `code-review` skill.
