---
name: writing-great-skills
description: "[M] Use when writing or editing a skill to make its behavior predictable and its instructions clear."
disable-model-invocation: true
---

# Writing Great Skills

A skill makes an agent follow a predictable process while allowing different outputs.
Bold terms use the authoritative definitions in [GLOSSARY.md](GLOSSARY.md).

## 1. Select the invocation mode

Before selecting or changing the invocation mode, read the glossary section [Invocation](GLOSSARY.md#invocation).

When the agent or another skill must find a skill without user action, make the skill **model-invoked**:

- Omit `disable-model-invocation`.
- Describe each distinct trigger branch once.
- Remove synonyms that describe the same trigger.
- When a **leading word** improves invocation, start the description with it.
- Keep behavior and background information in the skill body.

A model-invoked **description** adds permanent **context load**.
The description is complete when every required trigger branch appears once.

When explicit user choice is part of the behavior, make the skill **user-invoked**:

- Set `disable-model-invocation: true`.
- Write a short human-facing description.

A user-invoked skill adds **cognitive load** because the user must remember it.
If many user-invoked skills become difficult to remember, create a **router skill**.
The router must name each relevant skill and state its invocation condition.

This step is complete when the frontmatter, description, and invocation behavior match the selected mode.

## 2. Build the information hierarchy

Before placing or moving content, read the glossary section [Information Hierarchy](GLOSSARY.md#information-hierarchy).
Place content according to when the agent needs it:

1. Put ordered actions in in-skill **steps**.
2. Put universally required rules and facts in in-skill **reference**.
3. Put branch-specific skill material in **disclosed reference** behind a precise **context pointer**.
4. Put shared material that needs no independent invocation in **external reference** behind a precise context pointer.

End each step with a checkable **completion criterion**.
When incomplete coverage matters, make the criterion exhaustive.
A demanding criterion produces the required **legwork**.

When only some branches need detailed material, use **progressive disclosure**.
When a precise pointer does not load reliably, keep required material in `SKILL.md`.
Use **co-location** within each file.
Keep each concept's definition, rules, and exceptions under one heading.

This step is complete when every action and reference is at the lowest reliable level and every step has a sufficient completion criterion.

## 3. Split only at a useful seam

Before splitting a skill, read the glossary entries for [Granularity](GLOSSARY.md#granularity) and [Premature Completion](GLOSSARY.md#premature-completion).

When a distinct **leading word** must trigger independently, split by invocation.
When another skill must reach the capability, split by invocation.
If visible **post-completion steps** cause observed **premature completion**, consider a sequence split.
Before a sequence split, make the current completion criterion precise.
Use a sequence split only when the criterion cannot prevent the observed behavior.
A sequence split must create a real context boundary.

This step is complete when each split has an independent invocation need or an observed sequence failure.

## 4. Prune the skill

Before pruning, read the glossary section [Pruning](GLOSSARY.md#pruning).
Keep each meaning in one **single source of truth**.
Make each behavioral change through one authoritative edit.

Review each line for **relevance**.
Remove obsolete content.
Apply the **no-op** test to each sentence:

> Does this sentence change agent behavior from the default behavior?

Delete a sentence that fails the test.
A shorter no-op remains a no-op.

This step is complete when each retained line changes or supports the skill's current behavior and each meaning has one authority.

## 5. Use leading words

Before selecting a leading word, read the glossary entry [Leading Word](GLOSSARY.md#leading-word).
When an established compact concept anchors behavior more reliably than a longer explanation, use it.
Use the leading word in the body.
When the leading word should trigger invocation, use it in the description.
Keep its meaning consistent.
Repeat the term when repetition strengthens behavior.
Do not repeat its complete definition.

This step is complete when each leading word changes behavior more reliably than the wording it replaces.

## 6. Diagnose failure modes

During review, classify each observed failure with the glossary definition:

- For **premature completion**, strengthen the current completion criterion before splitting the sequence.
- For **duplication**, choose one authoritative location.
- For **sediment**, remove stale or irrelevant content.
- For **sprawl**, disclose conditional material or split a genuine branch or sequence.
- For a **no-op**, remove the instruction or replace it with an effective control.
- For **negation**, state the supported behavior directly.

A prohibition must express a hard guardrail.
When using a prohibition, pair it with the supported behavior.

The skill is complete when its invocation, hierarchy, completion criteria, splits, terminology, and failure controls satisfy every applicable rule above.
