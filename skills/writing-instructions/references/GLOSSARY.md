# Glossary: Writing Instructions

This glossary defines the vocabulary for [Writing Instructions](../SKILL.md).
The terms describe how instructions produce **predictability**.
A term marked _Failure mode_ identifies behavior that reduces predictability.
Bold terms in a definition are also defined in this glossary.

## Predictability

**Predictability** is the degree to which instructions make an actor follow the same process under the same conditions.
Predictability applies to the process, not to identical output.
For example, brainstorming instructions can predictably produce different ideas.

## Information hierarchy

**Information hierarchy** ranks instructional content by when the actor needs it:

1. In-scope **steps**.
2. In-scope **reference**.
3. Disclosed or external reference behind a **context pointer**.

When instructions contain steps, unrelated reference can hide the current action and weaken attention.
Keep immediately required content at the highest applicable level.

### Steps

**Steps** are ordered actions that the actor performs.
Each step ends with a **completion criterion**.
Instructions that contain only reference do not require artificial steps.

### Reference

**Reference** includes definitions, rules, facts, parameters, examples, and conditional guidance that the actor consults as required.
Reference can remain beside the steps, move to a disclosed file, or live outside the instruction package.
Move reference only when a reliable **context pointer** can load it at the correct time.

### Context pointer

A **context pointer** names out-of-context material and states when the actor must load it.
The wording determines whether the actor loads the target under the correct conditions.
Strengthen an unreliable context pointer before moving required material inline.

### Disclosed reference

**Disclosed reference** is instruction-specific reference in a sibling file behind a context pointer.
Use disclosed reference when only some branches need the material.

### External reference

**External reference** is shared material outside the instruction package that has no independent invocation behavior.
Use external reference when several instruction artifacts need one authoritative source.

### Progressive disclosure

**Progressive disclosure** moves reference behind a context pointer so the actor loads it only when required.
Progressive disclosure controls attention as well as context use.

Use branching as the placement test:

- Keep material inline when every branch needs it.
- Disclose material when only some branches need it.
- Keep required material inline when a precise pointer remains unreliable.

### Co-location

**Co-location** keeps a concept's definition, rules, and exceptions under one heading.
Information hierarchy determines how far the material lives from the primary instructions.
Co-location determines what material stays together at that location.

### Interface boundary

An **interface boundary** is the location where an actor encounters and uses an interface.
Put an interface's operations, parameters, valid states, and expected results at this boundary.
Put cross-interface policy in the applicable global instructions.

### Sprawl

_Sprawl_ is the failure mode in which active instructional content becomes too long to remain legible or effective.
Use information hierarchy to reduce sprawl.
Disclose conditional reference and split genuine branches or sequences.

Sprawl differs from **sediment**, which identifies stale content, and **duplication**, which identifies repeated meaning.

## Steering

**Steering** contains the controls that make behavior predictable.

### Branch

A **branch** is an invocation or execution condition that requires a distinct path through the instructions.
Linear instructions have no branches.
Several branches can share some steps.

### Leading word

A **leading word** is an established compact concept that already has a strong meaning for the model.
The model uses the leading word to organize related behavior.
Examples include _lesson_, _proximal zone of development_, _fog of war_, and _tracer bullet_.

A leading word can improve execution and invocation:

- In the instruction body, it anchors the same behavior wherever the term appears.
- In a skill description, it connects user language to the invocation trigger.

Prefer an established term when it expresses the required behavior precisely.
A new term requires more definition because it has no pretrained meaning.
Repeat the term when repetition strengthens its intended meaning.
Repeat the term, not its complete definition.

### Completion criterion

A **completion criterion** is the checkable condition that tells the actor whether a unit of work is complete.

**Clarity** makes completion checkable and resists **premature completion**.
**Demand** determines the required **legwork**.
An exhaustive completion criterion requires the actor to cover every applicable item.

### Legwork

**Legwork** is the investigation and execution that the actor performs inside one step.
Legwork includes reading files, gathering evidence, applying changes, and verifying results.
A demanding completion criterion increases required legwork.

### Post-completion steps

**Post-completion steps** are the steps that follow the current step.
Visible later steps can pull attention away from the current completion criterion.

### Premature completion

_Premature completion_ is the failure mode in which the actor leaves a step before satisfying its completion criterion because attention moves to post-completion steps.
Premature completion requires an unclear completion boundary and visible later steps that pull attention forward.

Make the current completion criterion precise before splitting a sequence.
If a precise criterion cannot prevent an observed failure, hide later steps behind a real context boundary.
Thin legwork without an early transition is a weak completion criterion, not premature completion.

## Pruning

**Pruning** keeps each line relevant and each meaning authoritative in one place.

### Single source of truth

A **single source of truth** is the state in which each meaning has one authoritative location.
A behavioral change requires one edit at that location.
**Duplication** violates the single source of truth.

### Duplication

_Duplication_ is the failure mode in which the same meaning has more than one authoritative location.
Duplication increases maintenance cost, context use, and unintended emphasis.
A leading word can repeat intentionally without duplicating its complete meaning.

### Relevance

**Relevance** is the degree to which a line bears on the instructions' current purpose.
A line loses relevance when it does not affect that purpose or becomes obsolete.
A relevant sentence can still be a **no-op**.

### Sediment

_Sediment_ is stale or irrelevant content that accumulates because additions are easier than removals.
Remove sediment when the behavior or environment changes.

### No-op

A _no-op_ is an instruction that does not change behavior from the model's default behavior.
It consumes context without improving predictability.

Apply this test to each sentence:

> Does this sentence change behavior from the default behavior?

Delete a sentence that fails the test.
A weak leading word can also be a no-op.
Replace a no-op only when the replacement changes behavior.
No-op is a model-relative judgment, so test disputed cases by observing behavior.
