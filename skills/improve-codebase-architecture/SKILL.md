---
name: improve-codebase-architecture
description: Scan a codebase for deepening opportunities, present them as a Lavish architecture report, then grill through whichever candidate the user picks.
disable-model-invocation: true
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities**.
A deepening opportunity is a refactor that turns shallow modules into deep ones, improving testability, locality, leverage, and AI-navigability.

This skill owns the discovery and visual review workflow.
It does not design final interfaces until the user chooses a candidate.

## Required vocabulary

Use the `codebase-design` skill for the architecture vocabulary and principles.
Load it before classifying or naming candidates.

Use these terms exactly:

- **module**
- **interface**
- **implementation**
- **depth**
- **deep**
- **shallow**
- **seam**
- **adapter**
- **leverage**
- **locality**

Do not substitute component, service, API, boundary, unit, layer, or wrapper when one of the vocabulary terms is meant.

Read the project's domain model before proposing candidates.
Prefer `CONTEXT.md` at the repo root.
If the repo has `CONTEXT-MAP.md`, follow it to the relevant context files.
Read ADRs in `docs/adr/` and any local ADR directory in the area under review.

## Process

### 1. Explore

Start by reading the domain glossary and relevant ADRs.
Then inspect the codebase for friction.

Use `fork` for broad read-only discovery when the area is unknown and fork is available.
If the task is already narrow, or if fork is unavailable, inspect directly with `read`, `bash`, search, and tests as needed.

Do not follow rigid heuristics.
Explore organically and note where understanding gets expensive.

Look for:

- Understanding one concept requires bouncing between many small modules.
- A module is shallow because its interface is nearly as complex as its implementation.
- Pure functions were extracted only for testability, while the real bugs hide in how they are called.
- Tightly-coupled modules leak across their seams.
- Tests need to reach past the interface to verify behavior.
- A seam has only one adapter and therefore may be hypothetical.
- A cluster has two real adapters and therefore may deserve a real seam.

Apply the **deletion test** to suspected shallow modules.
Ask whether deleting the module would concentrate complexity or merely move it into callers.
A module earns its keep when deleting it would spread complexity across callers.

### 2. Present candidates as a Lavish report

Create a visual architecture report with Lavish.
Do not write the report to the OS temp directory.
Do not open it with `xdg-open`, `open`, or `start`.

Use this artifact path pattern unless the user asks for another location:

```text
.lavish/reviews/architecture-review-<task-id>.html
```

Before writing the HTML, use Lavish guidance:

- `lavish_reference(action: "design")`
- `lavish_reference(action: "playbook", playbookId: "comparison")`
- `lavish_reference(action: "playbook", playbookId: "diagram")`
- `lavish_reference(action: "playbook", playbookId: "plan")`
- `lavish_reference(action: "playbook", playbookId: "input")` if the artifact collects the candidate choice

Use [HTML-REPORT.md](HTML-REPORT.md) for the report structure and visual patterns.
Call `lavish_review` after writing the artifact.
Fix any layout warnings before treating the report as ready.

Each candidate card must include:

- **Files** - which files or modules are involved.
- **Problem** - why the current architecture causes friction.
- **Solution** - plain English description of what would change.
- **Benefits** - explained with locality, leverage, and testability.
- **Before / After diagram** - side-by-side visual explanation of the shallowness and the deepening.
- **Recommendation strength** - one of `Strong`, `Worth exploring`, or `Speculative`.

End with a **Top recommendation** section.
Name the first candidate you would explore and why.

Use domain vocabulary from `CONTEXT.md` for domain concepts.
Use `codebase-design` vocabulary for architecture.
If `CONTEXT.md` defines `Order`, say `Order intake module`, not `FooBarHandler` or `Order service`.

For ADR conflicts, only surface a contradiction when the friction is real enough to justify reopening the decision.
Mark the conflict clearly in the candidate card.
Do not list every theoretical refactor an ADR forbids.

Do not propose final interfaces in the report.
After the report is ready, ask:

> Which candidate would you like to explore?

### 3. Grill the selected candidate

Once the user picks a candidate, use `grilling` to walk the design tree.
Ask one question at a time.
Focus on constraints, dependencies, the shape of the deepened module, what sits behind the seam, and which tests should survive.

Use `domain-modeling` while decisions crystallize.
Keep domain language current as part of the same conversation.

Update the domain model when:

- A deepened module needs a domain term that is missing from `CONTEXT.md`.
- A fuzzy term becomes precise.
- The selected seam depends on a domain distinction future agents must preserve.

Offer an ADR when:

- The user rejects a candidate for a durable reason.
- A decision would help future architecture reviews avoid relitigating the same option.
- A candidate intentionally reopens or supersedes an earlier ADR.

Skip ADRs for ephemeral reasons such as lack of time or immediate priority.

### 4. Hand off interface design only after selection

If the user wants concrete interface alternatives for the selected candidate, use `codebase-design`.
For multiple alternatives, follow `DESIGN-IT-TWICE.md` and use the `interface-designer` subagent identity when appropriate.

Do not run design-it-twice before the user selects a candidate.
Candidate discovery and interface design are separate phases.

## Completion criteria

The skill is complete when one of these is true:

- The user selects a candidate and the grilling loop has resolved the next decision.
- The user decides not to pursue any candidate, and any load-bearing rejection has been offered as an ADR.
- The user asks only for the report, and the Lavish review is finished.
