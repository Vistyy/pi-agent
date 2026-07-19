# HTML Report Format

Create one self-contained HTML artifact under `.lavish/reviews/`.
Review it with the `lavish` skill.
Use the target project's design system when Lavish guidance identifies one.
Otherwise, use the Tailwind and Mermaid CDN guidance from Lavish.

Use Mermaid for graph-shaped relationships.
Use HTML and inline SVG for mass diagrams, cross-sections, and other editorial visuals.
Select the format that communicates each candidate most directly.

## Scaffold

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Architecture review - {{repo name}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      /* small custom layer for things Tailwind doesn't cover cleanly:
         dashed seam lines, hand-drawn-feeling arrow heads, etc. */
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## Header

Include the repository name, date, and a compact diagram legend.
Define these visual meanings:

- Solid box: module.
- Dashed line: seam.
- Red arrow: leakage.
- Thick dark box: deep module.

Place candidates immediately after the header.

## Candidate card

Use one `<article>` for each candidate.
Keep prose short and use the canonical terms from `codebase-design`.
Let the diagrams show the structural difference.

Include:

- **Title**: Name the deepening change, such as `Collapse the Order intake pipeline`.
- **Badges**: Show `Strong`, `Worth exploring`, or `Speculative`.
  Also show `in-process`, `local-substitutable`, `ports & adapters`, or `mock`.
- **Files**: Show the involved paths with `font-mono text-sm`.
- **Before and After**: Place the two diagrams side by side when the viewport permits it.
- **Problem**: State the observed architectural friction in one sentence.
- **Solution**: State the proposed structural change in one sentence.
- **Wins**: Use short bullets that name concrete locality, leverage, interface, or test improvements.
- **ADR callout**: When applicable, name the conflicting ADR in one amber callout.

If a diagram requires a paragraph to explain it, revise the diagram.

## Select a diagram pattern

Use different patterns when candidates have different structural problems.

### Mermaid graph

Use a Mermaid `flowchart`, `graph`, or sequence diagram for dependencies, call flow, and network round trips.
Place the diagram in a styled card.
Use red edges for leakage and a dark style for the proposed deep module.

```html
<div class="rounded-lg border border-slate-200 bg-white p-4">
  <pre class="mermaid">
    flowchart LR
      A[OrderHandler] --> B[OrderValidator]
      B --> C[OrderRepo]
      C -.leak.-> D[PricingClient]
      classDef leak stroke:#dc2626,stroke-width:2px;
      class C,D leak
  </pre>
</div>
```

### HTML boxes and SVG arrows

Use bordered `<div>` elements for modules.
Use inline SVG `<line>` or `<path>` elements for arrows.
Use this pattern when the proposed deep module must visually contain faded internal behavior.

### Cross-section

Use stacked horizontal bands to show layers that one call crosses.
Show several thin bands before deepening and one thick responsibility band after deepening.

### Mass diagram

Show one rectangle for interface size and one for implementation size.
A shallow module has rectangles of similar size.
A deep module has a small interface rectangle and a large implementation rectangle.

### Call-graph collapse

Show the current call tree as nested boxes.
Show the proposed tree inside one module, with internal calls visually de-emphasized.

## Style

- Use generous whitespace and a restrained editorial layout.
- Use one accent color, red for leakage, and amber for warnings.
- Keep each diagram near 320 pixels high when side-by-side comparison is useful.
- Use `text-xs uppercase tracking-wider` for module labels.
- Limit scripts to the approved Tailwind and Mermaid CDN resources.
- Keep the artifact static except for Mermaid rendering.

## Top recommendation

Create one larger recommendation card.
Include the candidate name, one sentence explaining its priority, and an anchor link to its candidate card.

## Controlled vocabulary

Use these terms with their `codebase-design` meanings:

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

Use the canonical term whenever it applies.
For example:

- `Order intake module is shallow because its interface nearly matches its implementation.`
- `Pricing behavior leaks across the seam.`
- `Deepen the module behind one interface and one test surface.`
- `Two adapters justify the seam: HTTP in production and in-memory in tests.`

Make each Wins bullet name a specific gain:

- `Locality: defects concentrate in one module.`
- `Leverage: one interface serves multiple callers.`
- `The interface shrinks as the implementation absorbs pass-through modules.`

Remove introductory filler and unsupported quality claims.
Use the canonical architecture term instead of a general synonym.
