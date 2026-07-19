---
name: to-spec
description: "[M] Write a local specification from the current conversation."
disable-model-invocation: true
---

# To Spec

Use the current conversation and repository evidence to write a local specification.
Synthesize the available decisions without starting an exploratory interview.
Use the testing-seam confirmation as the only required user checkpoint.
Keep the specification local.

## 1. Gather context

Identify the current behavior and agreed product decisions.
Inspect the repository when the current implementation is not known.
Use terms from the project's domain glossary.
Apply relevant architectural decisions.

This step is complete when the following information is known:

- Current behavior.
- Agreed product decisions.
- Applicable domain terms.
- Applicable architectural constraints.

## 2. Confirm testing seams

Read and apply [layered seams](../../skills/tdd/SKILL.md#layered-seams).
Use existing public seams when they expose the required behavior.

Propose one primary acceptance seam.
Propose supporting seams for behavior variations and external contracts.
Ask the user to confirm the proposed seams.

This step is complete when the user confirms the primary and supporting seams.

## 3. Write the specification

Use the template below.
Save the result as a local Markdown file.
If the destination is unknown, ask the user where to save it.

This step is complete when the file exists, every template section is present, and every agreed product decision is covered.

<spec-template>

## Problem Statement

Describe the user's problem from the user's perspective.

## Solution

Describe the agreed solution from the user's perspective.

## User Stories

Write one numbered user story for each agreed user-facing behavior.
Use this form:

1. As an <actor>, I want a <feature>, so that <benefit>.

<user-story-example>
1. As a mobile bank customer, I want to see the balance of my accounts, so that I can make better-informed spending decisions.
</user-story-example>

## Implementation Decisions

Record the implementation decisions that are already settled.
Include applicable decisions about:

- Modules and interfaces.
- Technical behavior.
- Architecture.
- Schema and API contracts.
- Interactions between parts of the system.

Describe stable decisions without specific file paths or implementation code.
If a prototype expresses a settled decision more precisely than prose, include only the relevant state machine, reducer, schema, or type shape.
Identify the included material as prototype-derived.
Exclude the working prototype or demo.

## Testing Decisions

Record:

- The required external behavior.
- The primary and supporting test seams.
- Applicable testing precedent in the repository.

## Out of Scope

List behavior excluded from this specification.

## Further Notes

Record remaining context that affects implementation or verification.

</spec-template>
