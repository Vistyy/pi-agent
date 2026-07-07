---
name: to-prd
description: "[M] Turn the current conversation into a local PRD - no interview, just synthesis of what you've already discussed."
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a local PRD.
Do not interview the user.
Synthesize what you already know.

Do not publish externally.

## Process

1. Explore the repo to understand the current state of the codebase, if you have not already.
   Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs in the area you are touching.

2. Sketch out the seams at which you will test the feature.
   Existing seams should be preferred to new ones.
   Use the highest seam possible.
   If new seams are needed, propose them at the highest point you can.
   The fewer seams across the codebase, the better.
   The ideal number is one.

Check with the user that these seams match their expectations.

3. Write the PRD using the template below, then save it as a local Markdown file.
   If no destination is obvious, ask where to save it.

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A long, numbered list of user stories.
Each user story should be in this format:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending.
</user-story-example>

This list of user stories should be extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made.
This can include:

- The modules that will be built or modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do not include specific file paths or code snippets.
They may become outdated quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can, inline it within the relevant decision and note briefly that it came from a prototype.
Examples include a state machine, reducer, schema, or type shape.
Trim to the decision-rich parts.
Do not include a working demo.

## Testing Decisions

A list of testing decisions that were made.
Include:

- A description of what makes a good test: only test external behavior, not implementation details
- Which modules or seams will be tested
- Prior art for the tests, such as similar tests in the codebase

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

</prd-template>
