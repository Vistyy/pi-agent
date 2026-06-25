# Lavish Architecture Report Format

The architecture review is a Lavish HTML artifact.
It should make candidate tradeoffs visible enough that the user can choose one without reading a long prose report.

Create the artifact under `.lavish/reviews/` unless the user asks for another location.
Use a unique filename such as:

```text
.lavish/reviews/architecture-review-<task-id>.html
```

Use Lavish tools for review.
Do not open files with shell browser commands.

## Required Lavish guidance

Before writing HTML, load:

- `lavish_reference(action: "design")`
- `lavish_reference(action: "playbook", playbookId: "comparison")`
- `lavish_reference(action: "playbook", playbookId: "diagram")`
- `lavish_reference(action: "playbook", playbookId: "plan")`

Also load `input` if the artifact asks the user to choose a candidate inside the page.
Load `table` if file lists or candidate metadata become dense.

Use the design system selected by Lavish's priority order.
If the reviewed project has its own design system, match it.
Otherwise use the Lavish-recommended Tailwind CSS browser runtime plus DaisyUI CDN setup.

## Artifact structure

Use this structure:

1. Header
2. Legend
3. Candidate cards
4. Top recommendation
5. Candidate selection prompt

The report should be self-contained.
Keep local assets beside the HTML file and reference them with relative paths.
Never use root-relative asset paths.

## Header

Show:

- repository or project name
- review date
- short scope statement
- count of candidates

Avoid an introductory essay.
Start with the actionable architecture findings.

## Legend

Include a compact visual legend:

- solid box = module
- thin top strip = interface
- dashed line = seam
- red arrow = leakage across a seam
- dark filled box = deep module
- pale internal boxes = implementation details hidden behind an interface

The legend should reduce diagram interpretation effort.
Do not let it dominate the report.

## Candidate card

Each candidate is one card.
The card must be scannable before it is detailed.

Include:

- **Title** - short, names the deepening.
- **Recommendation strength** - `Strong`, `Worth exploring`, or `Speculative`.
- **Files** - monospaced file and module list.
- **Problem** - one or two sentences about current friction.
- **Solution** - one or two sentences about what changes.
- **Before / After diagram** - the center of the card.
- **Benefits** - bullets using locality, leverage, and testability.
- **ADR conflict** - only when a real conflict deserves attention.

Recommendation strength styling:

- `Strong` - success or emerald badge.
- `Worth exploring` - warning or amber badge.
- `Speculative` - neutral or slate badge.

Keep candidate prose short.
If a diagram needs a long explanation, redraw the diagram.

## Diagram rules

Use Mermaid for graph-shaped relationships:

- dependency graphs
- call flow
- state flow
- sequence diagrams

Use hand-built SVG or structured HTML only for editorial visuals:

- mass diagrams
- cross-sections
- interface-to-implementation ratios
- a deep module enclosing hidden implementation detail

Before and after diagrams should sit side by side on desktop and stack cleanly on narrow screens.
Prevent horizontal overflow at every nesting level.
Use `min-width: 0` and `minmax(0, 1fr)` where needed.

## Diagram patterns

### Mermaid dependency graph

Use when the point is call flow, dependency shape, or leakage.
Color leakage edges red.
Color the proposed deep module with the primary accent.

```html
<div class="rounded-box border bg-base-100 p-4">
  <pre class="mermaid">
flowchart LR
  A[Order handler] --> B[Order validator]
  B --> C[Order repository]
  C -. leaks .-> D[Pricing client]
  classDef leak stroke:#dc2626,stroke-width:2px;
  class C,D leak
  </pre>
</div>
```

### Mass diagram

Use when a module's interface is nearly as large as its implementation.
Show the interface as a top strip and the implementation as the body.
Before: the strip is tall.
After: the strip is short and the body is deep.

### Cross-section

Use when the problem is layered shallowness.
Before: many thin horizontal bands.
After: one thicker module with internal steps hidden behind one interface.

### Call-graph collapse

Use when callers currently coordinate too many functions.
Before: callers know the whole tree.
After: callers cross one interface and the tree moves inside the implementation.

## Benefits language

Use benefits that name the architectural gain directly.

Good examples:

- `locality: pricing bugs concentrate in one module`
- `leverage: one interface serves five call sites`
- `testability: tests cross the production seam`
- `depth: implementation absorbs shallow wrappers`

Avoid vague benefits:

- `cleaner code`
- `easier maintenance`
- `better separation`
- `more reusable`

## Top recommendation

End with one prominent card.
It should name the candidate to explore first and why.
The reason should fit in one short paragraph or three bullets.

Use the same vocabulary as the candidate cards.
Tie the recommendation to observed friction, not aesthetic preference.

## Candidate selection

If using an input-style artifact, give the user a clear selection prompt.
Otherwise ask in the normal conversation after `lavish_review` returns.

Use this wording:

> Which candidate would you like to explore?

Do not continue into interface design until the user chooses a candidate.

## Tone

Be concise and concrete.
Use domain vocabulary from `CONTEXT.md` and architecture vocabulary from `codebase-design`.

Use exactly:

- module
- interface
- implementation
- depth
- deep
- shallow
- seam
- adapter
- leverage
- locality

Avoid substituting:

- component
- service
- unit
- API
- signature
- boundary
- layer
- wrapper

Strong report phrasing:

- `Order intake module is shallow because its interface mirrors its implementation.`
- `Pricing leaks across the seam.`
- `Deepen the module so tests cross one interface.`
- `Two adapters justify the seam: HTTP in production and in-memory in tests.`

No hedging.
No throat-clearing.
No generic advice.
