# GLOSSARY.md Format

## Structure

For a repository with one domain language, create a root `GLOSSARY.md`:

```md
# {Domain name}

{One or two sentences describing the domain language covered here.}

## Language

**Order**:
A request from a Customer to provide specified products.

_Avoid_: Purchase, transaction

**Customer**:
A person or organization that places Orders.

_Avoid_: Client, buyer, account
```

## Rules

- **Be opinionated.** Choose one canonical term. List genuinely competing names under `_Avoid_`; do not invent aliases merely to fill the field.
- **Keep definitions tight.** Use one or two sentences to say what the concept is and distinguish it from the nearest confusing concept.
- **Include domain terms only.** Exclude ordinary programming vocabulary unless it has a project-specific meaning.
- **Record authoritative language.** Include language explicitly agreed for the work even when implementation has not caught up; disclose that discrepancy rather than describing planned speculation as current fact.
- **Exclude other documentation.** Specifications, workflows, schemas, APIs, implementation details, rationale, and task status belong elsewhere.
- **Group only when useful.** Add subheadings beneath `## Language` when natural domain groups materially improve navigation.

## Multiple glossaries

Use one root glossary by default. Introduce `GLOSSARY-MAP.md` only when separate scopes genuinely own independently evolving meanings. Directory, service, deployment, or technical-layer boundaries alone are insufficient.

A map identifies each glossary's location and language ownership, plus only the relationships needed to select the right owner:

```md
# Glossary Map

## Glossaries

- [Ordering](./ordering/GLOSSARY.md): owns language for accepting and changing Orders.
- [Fulfillment](./fulfillment/GLOSSARY.md): owns language for preparing and dispatching accepted Orders.

## Relationships

- **Ordering → Fulfillment**: an accepted Order becomes a Fulfillment request.
- **Ordering ↔ Fulfillment**: both use the same Order identity; Ordering owns its definition.
```

When ownership is unclear, resolve it before splitting or duplicating definitions. Respect an established project's differently named domain documents rather than creating a parallel glossary.

## Source

Adapted for glossary terminology from Matt Pocock's [`CONTEXT-FORMAT.md`](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/domain-modeling/CONTEXT-FORMAT.md), Copyright (c) 2026 Matt Pocock, used under the MIT License.
