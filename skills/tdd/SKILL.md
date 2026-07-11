---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
---

# Test-Driven Development

TDD is the red -> green loop.
This skill makes that loop produce tests worth keeping: what a good test is, where tests go, anti-patterns, and the rules of the loop.
Every section applies on every cycle.
Consult them before and during the loop, not after.

When exploring the codebase, read `CONTEXT.md` if it exists, so test names and interface vocabulary match the project's domain language.
Respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details.
Code can change entirely; tests should not.
A good test reads like a specification.
"User can checkout with valid cart" tells you exactly what capability exists.
It survives refactors because it does not care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside.
Tests live at seams, never against internals.

**Test only at appropriate public seams.**
Before writing any test, identify the seams under test and check that they are public boundaries for observable behavior.
You cannot test everything.
Choosing seams up front keeps testing effort on critical paths and complex logic instead of every edge case.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel such as querying the database instead of using the interface.
  The tell: the test breaks when you refactor but behavior has not changed.
- **Tautological**: the assertion recomputes the expected value the way the code does, so it passes by construction and can never disagree with the code.
  Examples: `expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way as the code, or a constant asserted equal to itself.
  Expected values must come from an independent source of truth: a known-good literal, a worked example, or the spec.
- **Horizontal slicing**: writing all tests first, then all implementation.
  Bulk tests verify imagined behavior.
  You test the shape of things rather than user-facing behavior, the tests become insensitive to real changes, and you commit to test structure before understanding the implementation.
  Work in **vertical slices** instead: one test -> one implementation -> repeat.
  Each test is a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.**
  Write the failing test first, then only enough code to pass it.
  Do not anticipate future tests or add speculative features.
- **One slice at a time.**
  One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.**
  It belongs to the review stage using the `code-review` skill, not the red -> green implementation cycle.
