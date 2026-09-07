# Architectural decision records

An ADR records an accepted architectural decision implemented by the current system.
Keep proposals and decisions awaiting implementation in the applicable plan; plan approval does not make them current architecture.

Create an ADR when a decision has meaningful reversal cost, a real trade-off, and a reason future maintainers need that the implementation does not explain.
Check existing records first and avoid duplicating their rationale.
A module split or configuration choice does not qualify merely because it is architectural work.

Follow the project's existing location and numbering convention.
Otherwise, use sequential files in the owning scope's `docs/adr/` directory without renumbering existing records.
A record usually needs:

```md
---
status: accepted
---

# Decision title

State the implemented decision, its context, and why it was chosen.
```

Add alternatives or consequences only when they explain a material trade-off.
Amend a record when the decision is unchanged; supersede it when the decision changes and the history remains useful.
Update affected references and remove stale pre-release records when project policy permits, rather than retaining them by convention.
