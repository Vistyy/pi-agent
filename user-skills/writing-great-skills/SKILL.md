---
name: writing-great-skills
description: "[M] Use when writing or editing a skill to make its behavior predictable and its instructions clear."
disable-model-invocation: true
---

# Writing Great Skills

A skill makes an agent use a predictable process.
Predictability means that the agent follows the same process on each run.
The process can produce different outputs.

Bold terms are defined in [GLOSSARY.md](GLOSSARY.md).
Use the glossary definitions when you apply these concepts.

## Select the invocation mode

A skill can be **model-invoked** or **user-invoked**.
Each mode has a different cost.

### Model-invoked

A model-invoked skill keeps its **description** in the agent context.
The agent can invoke the skill when a task matches the description.
Other skills can also reach it.
The description adds permanent **context load**.

To make a skill model-invoked:

- Omit `disable-model-invocation`.
- Describe the situations that must invoke the skill.
- Include each distinct trigger branch once.

Choose this mode when the agent or another skill must find the skill without user action.

### User-invoked

A user-invoked skill is available only when the user invokes it by name.
Its description is human-facing and adds no context load.
The user must remember when to invoke it, which adds **cognitive load**.

To make a skill user-invoked:

- Set `disable-model-invocation: true`.
- Write a short human-facing description.

Choose this mode when the skill should run only after an explicit user decision.

If many user-invoked skills become difficult to remember, create a **router skill**.
The router names each skill and explains when the user should invoke it.

## Write a model-invoked description

A model-invoked **description** determines when the agent loads the skill.
Every word in the description adds context load.

- Start with the skill's **leading word** when it improves invocation.
- State each distinct trigger branch once.
- Remove synonyms that describe the same trigger.
- Keep behavior and background information in the skill body.

The description is complete when every required invocation branch is present once.

## Build the information hierarchy

A skill contains **steps**, **reference**, or both.
Place information according to when the agent needs it.

1. **In-skill step**: An ordered action in `SKILL.md`.
   End each step with a checkable **completion criterion**.
2. **In-skill reference**: A definition, rule, or fact that every applicable branch needs.
3. **Disclosed reference**: Skill-specific material in a sibling file behind a **context pointer**.
4. **External reference**: Shared material outside the skill system behind a context pointer.

A completion criterion must let the agent distinguish complete work from incomplete work.
Make the criterion exhaustive when incomplete coverage would matter.
A demanding criterion produces the required **legwork**.

Use **progressive disclosure** when only some branches need detailed reference material.
Move skill-specific material to a named Markdown file in the skill directory.
Use an external reference when several skills need shared material that does not require independent invocation.
Write each context pointer so the agent knows exactly when to read the target.
Keep required material in `SKILL.md` when a pointer does not load reliably.

Use **co-location** inside each file.
Keep a concept's definition, rules, and exceptions under one heading.

## Split a skill only at a useful seam

**Granularity** controls how many skills represent one capability.
Each additional skill adds context load or cognitive load.

Split by invocation when a distinct leading word must trigger the new skill independently or another skill must reach it.
This creates another model-invoked description and increases context load.

Split by sequence when visible **post-completion steps** cause observed **premature completion**.
First, make the current completion criterion precise.
Use a sequence split only when the criterion cannot prevent the observed behavior.

## Prune the skill

Keep each meaning in one **single source of truth**.
A behavioral change must require one authoritative edit.

Review each line for **relevance**.
Remove content that does not affect the skill's current behavior.

Apply the **no-op** test to each sentence:

> Does this sentence change agent behavior from the default behavior?

Delete a sentence that fails the test.
A shorter no-op remains a no-op.

## Use leading words

A **leading word** is a compact concept that already has a strong meaning for the model.
It anchors related behavior with fewer tokens.
Examples include _lesson_, _fog of war_, and _tracer bullet_.

Use a leading word in the body to anchor execution.
Use it in the description when the same word should trigger invocation.
Repeat the term when repetition strengthens the intended behavior.
Keep its meaning consistent.

Look for repeated explanations that one strong term can replace.
For example:

- Replace repeated descriptions of a fast, deterministic feedback cycle with a _tight loop_.
- Use _red_ for a feedback loop that reproduces the specified defect.

A leading word earns its place when it changes behavior more reliably than the longer explanation.

## Diagnose failure modes

### Premature completion

The agent ends a step before it satisfies the completion criterion.
Make the criterion precise first.
If the criterion cannot become precise and the failure is observed, hide later steps behind a real context split.

### Duplication

The same meaning has multiple authoritative locations.
Choose one source and remove the other definitions.

### Sediment

Stale content remains because additions are easier than removals.
Review relevance and remove obsolete content.

### Sprawl

The skill contains too much active, unique material.
Use progressive disclosure or split a genuine branch or sequence.

### No-op

An instruction restates behavior that the model already performs.
Delete it or replace it with a stronger behavioral control.

### Negation

A prohibition can make the prohibited behavior more salient.
State the supported behavior directly.
Use a prohibition only for a hard guardrail, and pair it with the supported behavior.
