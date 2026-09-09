---
name: domain-modeling
description: "Use when work involves shaping, clarifying, or documenting a project's domain model or project-specific language, including domain concepts, relationships, lifecycle, and ownership boundaries; also use for glossaries and architectural decision records. Skip routine implementation against settled language and purely technical changes."
---

# Project language

Actively clarify the project's domain model while its language, relationships, or ownership boundaries are being designed. Reading established vocabulary during routine implementation does not require this skill.

Before proceeding, read and follow [Glossary formats](references/GLOSSARY-FORMAT.md). It owns glossary discovery, single-versus-multiple glossary selection, entry format, and the root glossary-map format.

## Find the owning language

Inspect applicable project instructions, domain documentation, and accepted requirements before defining a concept. Check implementation evidence when the discussion claims current behavior.

Use `GLOSSARY.md` and `GLOSSARY-MAP.md` for new documentation. Respect an established project's differently named domain documents rather than creating a parallel glossary or renaming them without authority.

If a root glossary map exists, read it and the affected glossary before reasoning about a term. Use the map's relationships to choose the owning scope. Ask only when materially different scopes remain plausible.

## Clarify concepts and relationships

Prefer familiar words used by users and maintainers. Give each concept one canonical term within its scope, and identify genuinely competing aliases to avoid.

Resolve meaning from accepted requirements, established language, and implementation evidence. When they conflict, explain the material difference instead of silently treating current code as the requirement. Use concrete scenarios to test relationships, lifecycle boundaries, and overloaded terms when prose leaves a consequential ambiguity.

When domain concepts determine APIs, responsibilities, or module boundaries, settle the concepts and their relationships first. Use the resulting language in those boundaries; do not manufacture domain terms for ordinary technical infrastructure.

## Record terms as they crystallize

When edits are authorized, create or update the owning glossary when an implemented, supported term becomes clear. Do not batch known definitions indefinitely. Create glossary files lazily—never create an empty glossary or map in anticipation of future concepts.

Keep planned concepts in the applicable plan until implemented. During read-only work, report proposed definitions and their intended owner instead of editing files or presenting them as current.

A glossary contains project-specific domain language and concise distinctions. It is not a specification, implementation guide, schema catalog, decision log, task tracker, or dumping ground for general programming terms.

When creating or changing an architectural decision record, read and follow [ADR guidance](references/ADR-FORMAT.md).
