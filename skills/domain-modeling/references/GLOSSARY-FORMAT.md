# Glossary formats

Use the smallest glossary structure that gives each project-specific concept one clear owner.

## Choose the structure

Inspect the repository root and existing domain documentation before creating anything.

- If `GLOSSARY-MAP.md` exists, use the mapped multi-glossary structure. Read the map and each glossary relevant to the current topic.
- If a root `GLOSSARY.md` exists without a map, use it as the single glossary.
- If the project has an established differently named domain document, follow that convention rather than creating a parallel glossary.
- If no glossary exists, default to one root `GLOSSARY.md` when the project has one cohesive domain language.
- Use multiple glossaries only when distinct scopes own meaning independently, such as when the same word has different meanings or each scope has concepts and rules that should evolve separately. Directory count, deployment topology, or technical layering alone does not justify multiple domain glossaries.

Create files lazily. Create the first glossary only when the first eligible term has crystallized. Create a root map only when a second independently owned glossary is justified; do not create empty placeholders.

## Glossary format

A single-domain repository uses `/GLOSSARY.md`. In a multi-glossary repository, each owning scope has a `GLOSSARY.md` at the nearest stable location identified by the root map.

```md
# Glossary

{One or two sentences identifying the domain language covered here.}

## Attempt

One execution of an assignment. An assignment may have several attempts; retrying does not create a new assignment.

_Avoid:_ Run, job

## Assignment

A bounded contribution requested by the coordinator within one intent.

_Avoid:_ Task
```

When natural groups materially improve navigation, group terms beneath a domain heading:

```md
## Delegation

### Assignment

A bounded contribution requested by the coordinator within one intent.

_Avoid:_ Task
```

Apply these rules:

- **Choose one canonical term.** List genuinely competing names under `_Avoid:_`; do not invent aliases merely to fill the field.
- **Keep definitions tight.** Use one or two sentences to identify what the concept is and distinguish it from its nearest confusing concepts.
- **Include domain terms only.** Exclude ordinary programming vocabulary unless it has a distinct project meaning.
- **Record current meaning.** Keep planned concepts in plans until they are implemented and supported.
- **Keep one owner.** Define a term in one glossary. Other glossaries may link to it rather than copy its definition.
- **Keep other documentation with its owner.** Specifications, workflows, schemas, APIs, implementation details, rationale, and task status do not belong in the glossary.

## Multiple glossaries

A repository with independently owned domain languages uses a root map:

```text
/
├── GLOSSARY-MAP.md
├── ordering/
│   └── GLOSSARY.md
└── fulfillment/
    └── GLOSSARY.md
```

An existing root `GLOSSARY.md` may remain one of the mapped glossaries when introducing a second scope; move it only when the new location has a clearer stable owner and the move is authorized.

### Root `GLOSSARY-MAP.md` format

```md
# Glossary Map

{One or two sentences describing why the repository has multiple domain languages.}

## Domain glossaries

- [Ordering](./ordering/GLOSSARY.md) — owns the language for accepting and changing customer orders.
- [Fulfillment](./fulfillment/GLOSSARY.md) — owns the language for preparing and dispatching accepted orders.

## Relationships

- **Ordering → Fulfillment:** an accepted order becomes a request for fulfillment.
- **Ordering ↔ Fulfillment:** both refer to the same order identity; Ordering owns its definition.
```

The map records only what helps readers select the right glossary and understand domain ownership:

- the path and scope of each glossary;
- directional or shared relationships between scopes;
- ownership of concepts that cross scopes;
- material translation where two scopes use different terms for related concepts.

Do not turn the map into a module inventory, dependency graph, API catalog, event specification, or architecture decision record.

When a new scope is proposed, test whether it truly owns distinct language. If it does, update the root map and create its glossary together when edits are authorized. If ownership remains materially ambiguous, ask before splitting or duplicating definitions.

## Source inspiration

Adapted for `GLOSSARY.md` terminology from Matt Pocock's [`CONTEXT-FORMAT.md`](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/domain-modeling/CONTEXT-FORMAT.md), Copyright (c) 2026 Matt Pocock, used under the MIT License.
