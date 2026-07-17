---
name: to-spec
description: "[M] Write a local specification from the current conversation."
disable-model-invocation: true
---

# To Spec

Synthesize the current conversation context and codebase understanding into a local specification without an exploratory interview.
The only required user checkpoint is confirmation of the testing seams.
Do not publish externally.

## 1. Gather context

Explore the repository when its current state is not already understood.
Use the project's domain glossary vocabulary and respect relevant architectural decisions.

Completion criterion: the current behavior, agreed product decisions, domain vocabulary, and relevant architectural constraints are known.

## 2. Confirm testing seams

Read and apply the canonical [layered seams](../../skills/tdd/SKILL.md#layered-seams) rule.
Prefer existing public seams to new ones.
Sketch the primary acceptance seam and the supporting seams needed for behavior variations and external contracts.
Ask the user to confirm that these seams match their expectations.

Completion criterion: the user has confirmed the primary acceptance seam and supporting test seams.

## 3. Write the specification

Write the specification using the template below and save it as a local Markdown file.
If no destination is clear, ask where to save it.

Completion criterion: the saved specification covers every agreed product decision and every template section.

<spec-template>

## Problem Statement

The problem the user faces, from the user's perspective.

## Solution

The solution, from the user's perspective.

## User Stories

An extensive numbered list covering every aspect of the feature.
Write each user story in this form:

1. As an <actor>, I want a <feature>, so that <benefit>.

<user-story-example>
1. As a mobile bank customer, I want to see the balance of my accounts, so that I can make better-informed spending decisions.
</user-story-example>

## Implementation Decisions

Record the implementation decisions already made, including relevant:

- Modules and interfaces that will change.
- Technical clarifications.
- Architectural decisions.
- Schema and API contracts.
- Specific interactions.

Avoid specific file paths or code snippets because they become stale quickly.
When a prototype encodes a decision more precisely than prose, inline only its decision-rich portion and identify it as prototype-derived.
Examples include a state machine, reducer, schema, or type shape.
Do not include a working demo.

## Testing Decisions

Record:

- What makes a good external-behavior test.
- Which modules or seams will be tested.
- Relevant testing precedent in the repository.

## Out of Scope

Describe behavior excluded from this specification.

## Further Notes

Record any remaining relevant context.

</spec-template>
