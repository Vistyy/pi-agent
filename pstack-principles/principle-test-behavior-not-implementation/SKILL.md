---
name: principle-test-behavior-not-implementation
description: "Apply when you write, change, or keep a test. Exercise the code through its supported interface and assert observable outputs or effects against independent expected results. For concrete inputs, assert literal expected outputs or observable effects. Reject self-referential, fixture-only, and private-implementation checks, not matcher names."
---

# Test Behavior, Not Implementation

A test exercises the code the way its users do and asserts the observable contract against an independent expected result. For concrete inputs, assert literal expected outputs or observable effects. Do not compute the expected answer with the same production logic the assertion is meant to check.

**The check:** Before keeping a runtime test, identify the input, how the subject runs, the observable outcome, and the independent expectation. If the subject never produces the asserted outcome, the expectation merely repeats the subject's answer, or the assertions protect private implementation details rather than the contract, rewrite the test. If no meaningful behavioral assertion exists, delete it.

**Why:** A test that cannot detect a defect costs CI time and review attention while catching nothing. Tests should protect the contract, not obstruct an implementation change that preserves it.

**Inspect these patterns by what they observe, not by matcher name:**
- **No observable outcome.** The subject runs, but no assertion checks its required result or effect. A presence or type assertion is useful only when it checks the actual contract; it does not establish unrelated output correctness.
- **Mock or absence only.** A private call count does not prove the result or payload is right. Exercise the operation and assert the received payload, externally observable interaction, or resulting state. An absence check must observe the actual code path; include a positive control showing the mechanism operates, such as presence for another input. Empty results and no-call expectations are not inherently invalid.
- **Self-referential.** The expected answer comes from the same code under test: `expect(f(a)).toBe(f(a))`, or `expect(parsed.url).toBe(buildUrl(...))` when that builder is the production logic being checked. Use an independent expectation.
- **Internal constant pin.** Restating a private constant or prompt string can lock implementation details without observing behavior. Test the mechanism that consumes it. A published default or protocol value can be a real contract; verify the value or behavior users actually consume.
- **Fixture asserts fixture.** The assertion reads only data the test constructed or computed in setup, rather than an outcome produced by the subject.

**The fix:** Exercise the subject with one concrete input and assert the literal output or observable effect, `expect(slugify("Hello, World!")).toBe("hello-world")`. Judge the assertion by the contract it verifies, not by whether it uses `toBeDefined`, `toBeTruthy`, an empty result, or a mock. When no meaningful assertion exists, delete the test.

**Keep** a test of a required relation across a table's rows (a key present in two tables, a parent that exists), and a compile-time check in a `*.test-d.ts` file.
