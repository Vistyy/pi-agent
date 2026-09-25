---
name: domain-language
description: >-
  Clarify project-specific concepts, relationships, and canonical terminology.
  Use when resolving ambiguous or conflicting domain meanings or maintaining
  a glossary. Skip routine use of settled terminology and code changes that
  do not affect domain meaning.
---

# Domain Language

Actively clarify the project's domain language as you design: challenge terms, test their meanings against concrete scenarios, and record agreed terminology. Merely reading a glossary for established vocabulary does not require this skill.

## File structure

Most repositories have one root `GLOSSARY.md`.

If `GLOSSARY-MAP.md` exists at the root, the repository has multiple independently owned domain languages. The map identifies their glossaries and relationships.

Create files lazily. Create the first glossary when the first term is resolved and the map when a second language owner is justified. Follow an established project's differently named domain documents rather than creating a parallel glossary.

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
