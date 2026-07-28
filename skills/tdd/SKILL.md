---
name: tdd
description: Use when implementing a feature or defect fix test-first, applying red-green-refactor, or adding or changing tests.
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

## Keep only durable tests

A committed test must protect supported behavior, an interface, or an invariant.
Do not retain a test only to prove that an edit occurred.
Do not retain a test only to prove that retired text, symbols, files, or implementation structure are absent.
Use search, diff review, type checking, or a one-time script to verify the change itself.
A negative assertion must prove a prohibition that a caller can observe.
Assert exact document content only when a consumer depends on that content or the assertion verifies synchronization with an executable source.
Before retaining a test, ask whether its removal would reduce confidence in supported behavior.
If removal would not reduce confidence, do not commit the test.

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

### Control test cost

Optimize for confidence gained per execution cost.
Retain the fewest expensive tests that prove each distinct external contract or reproduced regression class.
Test policy, input, and result variations at the cheapest public seam that proves them reliably.
Do not repeat process, Git, database, package, browser, or other external setup for variations that an in-process seam can prove.
Test count and coverage percentage are not measures of test value.
Before adding a test to a slow suite, measure its focused runtime and its effect on the maintained suite runtime.
Do not increase a shared or global timeout to accommodate one slow test.
Optimize the test or apply a justified local timeout to the irreducible external operation.

Test selection is complete when each retained test protects distinct behavior or a distinct failure class at the cheapest reliable seam.

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

Each red-green cycle is a **test-level tracer bullet** through one public seam.
A test-level tracer bullet does not define a Task boundary.
Use the [vertical-slices skill](../vertical-slices/SKILL.md) for task-level tracer bullets and Task boundaries.

## Run each cycle

Before changing ownership, interfaces, seams, adapters, or test surfaces during any cycle, apply the `codebase-design` skill.

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

### Refactor from evidence

Inspect the completed slice for unclear names, duplication, and unnecessary complexity.
Refactor only when the completed slice provides evidence for the improvement.
Run the current and relevant existing tests after refactoring.

The cycle is complete when the current test first fails for the expected reason, the minimum implementation makes it pass, the refactoring decision is explicit, and the current and relevant existing tests pass.

### Continue from evidence

Select the next test from the remaining required behavior and the completed cycle's evidence.
Repeat one test -> one implementation until every required behavior has a passing test at the applicable public seam.

Use the `code-review` skill to review the completed diff.
