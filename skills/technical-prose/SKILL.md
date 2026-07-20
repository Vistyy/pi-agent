---
name: technical-prose
description: Use when writing or revising prose that must communicate technical instructions or meaning precisely.
---

# Technical Prose

Write technical and agent-facing prose in a controlled, explicit style inspired by ASD-STE100.

## Apply the correct level of control

Apply these rules strictly to instructions, requirements, definitions, warnings, conditions, and completion criteria.
When connected explanatory prose improves understanding, apply these rules less strictly.
Preserve exact code identifiers, commands, paths, errors, quotations, and required domain terms.

## Control vocabulary

- Use one canonical term for each concept and meaning.
- When precise project terminology is available, use it.
- Define an unfamiliar term before depending on it.
- Repeat the canonical term instead of using synonyms for variety.
- Use literal words in instructions and requirements.
- When a pronoun or general reference would be ambiguous, name the applicable file, module, command, actor, or result.

Metaphors and idioms may support an explanation.
Each instruction or requirement must remain complete without them.

## Construct explicit sentences

- When the actor is known and relevant, use active voice.
- When responsibility could be unclear, name the actor.
- State each condition before the action that depends on it.
- Put one requirement or one primary action in each sentence.
- Keep each action with its object.
- Separate requirements from rationale and examples.
- State the supported behavior directly.
- A prohibition must express a hard guardrail.
- When you use a prohibition, state the supported alternative with it.
- When `because`, `so`, `but`, or `if` expresses a necessary relationship, preserve the word.

Review each instruction longer than 20 words and each descriptive sentence longer than 25 words.
When a split preserves the conditions, contrasts, and causes, split the long sentence.

## Apply the prose-type pattern

### Instructions

Use the imperative form.
Put prerequisites and conditions before the command.
Give each numbered step one primary action.
When the expected result is not obvious, state the expected result.

Use this pattern:

> If or when condition, perform action.
> Expected result.

Before:

> When a term is resolved, update `CONTEXT.md` right there and do not batch these up because they must be captured as they happen.

After:

> When the user resolves a term, update `CONTEXT.md` immediately.
> Record each resolved term before you continue the discussion.

### Requirements

Use modal verbs consistently:

- `must` identifies a requirement.
- `should` identifies a recommendation.
- `may` gives permission.
- `can` identifies a capability or possible result.

Name the subject.
Make the required state or behavior observable.

Before:

> The context file should be totally devoid of implementation details.

After:

> `CONTEXT.md` must contain only domain terms and definitions.
> Record implementation decisions in the applicable technical documentation.

### Definitions

Start with the canonical term.
State what the term identifies.
Add only the boundary needed to distinguish the term from related terms.

### Warnings

State the hazard or invalid state first.
State the consequence next.
State the prevention or recovery action last.
A warning must describe a consequence that justifies interruption.

### Explanations

Give each paragraph one topic.
Start with the controlling fact or claim.
Keep related causes, consequences, conditions, and exceptions together.

## Organize information

- Use prose for connected reasoning.
- Use numbered lists for ordered actions.
- Use bullets for parallel facts or options.
- Keep each rule beside its conditions, exceptions, and examples.
- Separate normative language from background information.

## Review the result

Review every changed passage before completion.
Confirm all applicable statements:

- Each concept has one canonical term and meaning.
- Each instruction has one primary action.
- Each condition precedes its dependent action.
- Each requirement names its subject and defines an observable state or behavior.
- Each pronoun and reference has an unambiguous referent.
- Each metaphor in normative prose has a literal replacement.
- Each sentence above the length threshold received deliberate review.
- Requirements, rationale, and examples are distinct.
- Exact technical text outside the requested changes remains unchanged.
- The rewrite preserves the original technical meaning.
- The document-specific completion criteria are satisfied.

The prose is complete when every applicable statement is true.
