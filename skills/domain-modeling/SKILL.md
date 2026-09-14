---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing project terminology, shaping domain concepts or relationships, writing or editing a GLOSSARY.md, or recording or editing an ADR. Skip routine use of already-settled language and purely technical changes.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the active discipline: challenge terms, invent concrete edge-case scenarios, and record language and decisions when they crystallize. Merely reading a glossary for established vocabulary does not require this skill.

## File structure

Most repositories have one domain glossary:

```text
/
├── GLOSSARY.md
├── docs/
│   └── adr/
└── src/
```

If `GLOSSARY-MAP.md` exists at the root, the repository has multiple independently owned domain languages. The map identifies their glossaries and relationships.

Create files lazily. Create the first glossary when the first term is resolved, the map when a second language owner is justified, and the ADR directory when the first ADR is needed. Follow an established project's differently named domain documents rather than creating a parallel glossary.

Before editing a glossary, read and follow [Glossary format](references/GLOSSARY-FORMAT.md).

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing glossary, call it out immediately: “The glossary defines cancellation as X, but you seem to mean Y. Which is it?”

### Sharpen fuzzy language

When the user uses a vague or overloaded term, propose a precise canonical term: “When you say account, do you mean the Customer or the User? Those are different concepts.”

### Discuss concrete scenarios

Stress-test domain relationships with specific scenarios. Invent cases that expose edge conditions and force precise boundaries between concepts.

### Cross-reference with code

When someone states how the domain works, check whether the implementation agrees. Surface contradictions rather than silently treating either source as authoritative: “The glossary permits partial cancellation, but the code cancels an entire Order. Which should change?”

### Update the glossary inline

When language is explicitly agreed as authoritative for the work, update the glossary then rather than batching it. If implementation still conflicts, disclose that discrepancy instead of delaying the glossary or claiming the code already conforms.

A glossary contains project-specific language only. It is not a specification, implementation guide, schema catalog, scratch pad, decision log, or task tracker.

### Offer ADRs sparingly

Offer an ADR only when all three are true:

1. **Hard to reverse:** changing the decision later would be meaningfully costly.
2. **Surprising without context:** a future maintainer would reasonably wonder why it was chosen.
3. **A real trade-off:** credible alternatives existed and were rejected for specific reasons.

If any condition is missing, skip the ADR. When an ADR is warranted, read and follow [ADR format](references/ADR-FORMAT.md).
