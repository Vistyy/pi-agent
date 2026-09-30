---
name: architect
description: >-
  Use for "architect this", "sketch the design", "design this", or non-trivial
  implementation work where jumping straight to code would lock in the wrong
  shape. Ground the affected system, derive a design from caller usage, and make
  types, interfaces, boundaries, invariants, and trade-offs inspectable before
  implementation.
---

# Architect

Develop a concrete design directly in the main agent. Sketch types, function signatures, class shapes, and module boundaries before filling in implementation. If implementation proves the sketch wrong, redesign rather than bolting fixes onto it.

## 1. Ground the problem

Build a real mental model of every system the new code touches. Read and follow [how](../how/SKILL.md) over the relevant subsystems. Naming a file isn't grounding.

If the design redefines ownership or layering, investigate the rationale for the existing shape so it becomes a constraint, not a guess.

Skip grounding only when the work is genuinely greenfield with no surrounding system to integrate.

## 2. Write caller usage first

Write the README-style usage and two or three realistic call sites before the types. Show what the consumer imports, calls, and receives.

Derive the type sketch from that usage. The usage is the spec; the two must agree. When they diverge, reconcile the sketch to the usage, not the reverse.

## 3. Sketch the shape

- **Data structures first.** Get the core types right. Trace each dominant access pattern through the proposed structure. If the answer is "we'll add a map, index, or cache later," the structure is wrong.
- **Interface depth.** Prefer a simple public surface that hides substantial capability and policy, even when the implementation becomes less simple. Parse transport or wire types into domain types behind the interface.
- **Shared state.** If two actors might both write, ask what happens. If the answer isn't "nothing," default to per-actor state with a merge at the read boundary.
- **Visible boundaries.** Use `not implemented` bodies and pseudocode for tricky logic, with intent and invariants stated where needed. A reader should trace input to output through types and signatures alone.
- **Encoded invariants.** Prefer hard-to-misuse types over runtime checks, and runtime checks over prose comments.
- **Boundary validation.** Validate at boundaries and trust types inside. Keep business logic pure and the shell thin.
- **Single source of truth.** Derive instead of synchronizing copies of an invariant.
- **Idempotent transitions.** Where applicable, ask what happens if an operation runs twice or crashes halfway.
- **Short call chains.** If tracing the flow needs more than three files, flatten the hierarchy.

## 4. Screen for structural red flags

Revise or reject a shape with these problems:

- **Shallow modules.** A large interface hides little complexity. Callers coordinate several methods for one operation, public options expose internal stages, or learning the interface still requires learning the implementation. A deep module concentrates capability behind one interface; it is not a deep call chain.
- **Information leakage.** Multiple modules depend on the same internal representation, policy, or protocol decision. Keep storage schemas, framework objects, and wire types private; parse external data into domain types behind the interface.
- **Temporal decomposition.** Modules are organized around execution order, such as load, validate, transform, and save, instead of the knowledge and decisions they own. Group code around domain knowledge and ownership, including methods that run at different times.
- **Pass-through methods.** A layer forwards the same arguments with the same shape without hiding complexity. Remove it or move responsibility to the module that completes the operation. Keep a forwarding boundary when it adds policy, adaptation, or a distinct abstraction.

## 5. Present the sketch and rationale

For small changes, one file with the new types and signatures. For larger work, a module map plus type definitions. Include the caller usage and a one-page rationale alongside the sketch. Use sentence-case headings without boilerplate:

- **Problem.** What we're trying to do, what makes the shape non-obvious, and the constraints grounding surfaced.
- **Shape.** Data structures, flow through signatures, load-bearing decisions, encoded invariants, validation boundaries, and what the system deliberately does not do. State what complexity the public surface hides and exposes, and why it is no larger than needed.
- **Trade-offs accepted.** "We accept X in exchange for Y." Name choices a future reader might mistake for an oversight.
- **Open questions and risks.** Questions the human needs to weigh in on before implementation.
- **Next implementation step.** The first thing to build against the sketch, in one sentence.

If the human pushes back on the shape, treat that as new grounding evidence. Re-ground and re-sketch before writing more code.

## 6. Reconsider when implementation fights the sketch

When implementation fills in the sketch, deviations are signals to examine, not friction to absorb silently. An unexpected parameter may mean the sketch is wrong, a requirement was missed, or the implementation is overreaching.

Look for a pattern, not an isolated edge case:

- The same workaround across unrelated code.
- Unrelated edge cases needing special-case branches.
- Types needing `any`, casts, or optional fields that are always set in practice.
- Callers needing to know the abstraction's internal rules.
- Shared-state locking where the sketch assumed no sharing.
- Two or more independent deviations of the same shape.

A few edge cases don't condemn an architecture. Complexity in the data is not complexity in the design.

When the pattern shows the architecture is wrong, re-ground with `how`. Redesign as if the newly discovered constraints had been foundational from day one. Subtract before adding: simplify the old shape before growing the replacement. Return to sketching.
