---
name: improve-codebase-architecture
description: "[M] Review codebase architecture, produce a visual deepening report, then grill one candidate."
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** - refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Before starting, use the `codebase-design` skill for the architecture vocabulary (**module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**) and its principles (the deletion test, "the interface is the test surface", "one adapter = hypothetical seam, two = real").
  Use these terms for architectural claims.
  Do not substitute "component," "service," "API," or "boundary" when you mean module, interface, or seam.
- The domain language in `CONTEXT.md` gives names to good seams; ADRs in `docs/adr/` record decisions this command should not re-litigate.

## Process

### 1. Explore

Select the target area before you scan the codebase.
If the user names a module, subsystem, or pain point, use that target.
Otherwise, inspect a representative range of recent commits with `git log --oneline`.
Give priority to files and areas that change repeatedly.
If recent changes have no clear concentration, widen the scan.

Read the project's domain glossary (`CONTEXT.md`) and any ADRs in the target area.

Use `fork` when the target area spans multiple directories, unclear ownership, or more than one domain concept.
Inspect directly when the user named a specific module, file, or seam.
Explore for these signals:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** - interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to each suspected shallow module: would deleting it concentrate complexity, or just move it?
A "yes, concentrates" is the signal you want.
Exploration is complete when you have either three credible deepening candidates or can explain why fewer exist.
For each candidate, record the involved files, the shallow interface, the hidden implementation complexity, and the deletion-test result.

### 2. Present candidates as an HTML report

Use the `lavish` skill before writing the report.
Create `.lavish/reviews/architecture-review-<timestamp>.html` using [HTML-REPORT.md](HTML-REPORT.md).
Include every credible candidate, before/after visuals, and a top recommendation.
Run the Lavish review and do not hand off until the artifact has no layout warnings.

**Use CONTEXT.md vocabulary for the domain, and the `codebase-design` vocabulary for the architecture.** If `CONTEXT.md` defines "Order," talk about "the Order intake module" - not "the FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card (e.g. a warning callout: _"contradicts ADR-0007 - but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.

Do NOT propose interfaces yet. After the file is written, ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, use the `grilling` skill to walk the design tree with them - constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.
The loop is done when the chosen candidate has a named deep module, proposed interface, hidden implementation, adapters if any, surviving tests, and domain or ADR updates completed or explicitly declined.

Side effects happen inline as decisions crystallize - use the `domain-modeling` skill to keep the domain model current as you go:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md`. Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing - skip ephemeral reasons ("not worth it right now") and self-evident ones.
- **Want to explore alternative interfaces for the deepened module?** Use the `codebase-design` skill and its design-it-twice parallel subagent pattern.
