---
name: domain-modeling
description: Use when defining or changing project-specific terms, resolving conflicting meanings or domain relationships, or maintaining a glossary or architectural decision record. Skip routine use of established terms.
---

# Project language

Use a glossary to make project-specific concepts and their distinctions easy to understand.
Prefer familiar words used by users and maintainers rather than inventing a name for every mechanism.
Keep ordinary programming vocabulary out unless it has a distinct project meaning.

## Find and clarify the meaning

Consult the applicable project instructions and existing domain documentation before defining a term.
Use `GLOSSARY.md` for new glossaries; respect an existing project's naming and scope rather than automatically renaming its `CONTEXT.md` or other documentation.
When several scopes use different meanings, identify the relevant scope without requiring a new context map or directory structure.

Resolve meanings from accepted requirements, established language, and implementation evidence.
If these conflict, explain the material difference instead of silently treating the current code as the requirement.
Use a concrete scenario to clarify a relationship when prose alone leaves an important ambiguity.
Ask only when the unresolved meaning could change the work.

## Record useful definitions

Give each concept one canonical term within its scope.
Define what it identifies and how it differs from closely related concepts.
Mention aliases or relationships only when they prevent a real misunderstanding.
A simple entry is enough:

```md
## Attempt

One execution of an assignment.
An assignment may have several attempts; retrying does not create a new assignment.
```

Record implemented, supported concepts in the current glossary and keep planned concepts in the applicable plan until implemented.
Update affected definitions when an authorized change alters their meaning.
Keep specifications, implementation details, and decision rationale with their respective owners rather than turning the glossary into a specification store.

When creating or changing an architectural decision record, read [ADR guidance](references/ADR-FORMAT.md).
