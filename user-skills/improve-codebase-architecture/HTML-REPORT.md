# HTML Report Format

Use this reference after the parent skill selects architecture candidates.
The `lavish` skill controls artifact creation, design-system selection, browser review, and layout verification.
This reference controls report content.

## Report structure

Create one report with these sections in order:

1. Header and legend.
2. Candidate cards.
3. Top recommendation.

The header must name the repository and report date.
Define these visual meanings in a compact legend:

- Solid box: module.
- Dashed line: seam.
- Red arrow: leaked behavior.
- Thick dark box: deep module.

## Candidate cards

Use one annotation target for each candidate.
Each candidate card must include:

- **Title**: Name the deepening change, such as `Collapse the Order intake pipeline`.
- **Confidence**: Use `Strong`, `Worth exploring`, or `Speculative`.
- **Dependency category**: Use `in-process`, `local-substitutable`, `ports & adapters`, or `mock` when applicable.
- **Files**: Show involved paths in a compact monospace style.
- **Before and after**: Show the current and proposed structure together when the viewport permits.
- **Problem**: State the observed architectural friction in one sentence.
- **Solution**: State the proposed structural change in one sentence.
- **Wins**: Name concrete locality, leverage, interface, or test improvements.
- **ADR conflict**: When applicable, name the conflicting ADR in one warning callout.

Keep candidate prose short.
Remove introductory filler and unsupported quality claims.
If a diagram requires a paragraph to explain it, revise the diagram.

## Diagram selection

Use Mermaid for dependencies, call flow, state, sequences, and network round trips.
Use SVG only when a mass diagram or annotated cross-section communicates the structure more directly.
Open the applicable Lavish diagram guidance before creating either format.

Select the pattern that matches the candidate:

- **Dependency graph**: Show behavior or knowledge crossing module seams.
- **Cross-section**: Show layers crossed by one call before and after deepening.
- **Mass diagram**: Compare interface size with implementation size.
- **Call-graph collapse**: Show a distributed call tree moving inside one module.
- **Containment diagram**: Show faded internal behavior inside the proposed deep module.

Use red edges only for leakage.
Use the darkest visual weight for the proposed deep module.
When side-by-side comparison is useful, keep both diagrams at comparable dimensions.

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

Each Wins item must name a specific gain.
Examples include `Locality: defects concentrate in one module` and `Leverage: one interface serves multiple callers`.
When the implementation absorbs pass-through modules, show the smaller resulting interface.

## Top recommendation

Create one visually dominant recommendation card.
Include the candidate name, one sentence explaining its priority, and an anchor link to the candidate card.
