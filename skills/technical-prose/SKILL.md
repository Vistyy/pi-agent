---
name: technical-prose
description: Use when writing or revising prose that must communicate technical instructions or meaning precisely.
---

# Technical Prose

Write technical and agent-facing prose in a controlled, explicit style inspired by ASD-STE100.

## Apply the correct level of control

Apply these rules strictly to:

- Instructions.
- Requirements.
- Definitions.
- Warnings.
- Conditions.
- Completion criteria.

Apply these rules less strictly to explanatory prose when connected reasoning improves understanding.
Preserve exact code identifiers, commands, paths, errors, quotations, and required domain terms.

## Use controlled vocabulary

- Use one canonical term for each concept.
- Use each term with one meaning in the same context.
- Repeat the canonical term instead of introducing a synonym for variety.
- Use project terminology when it is more precise than general English.
- Define an unfamiliar project term before you depend on it.
- Use literal words for requirements and instructions.
- Use pronouns only when their referents are unambiguous.
- Name the applicable file, module, command, actor, or result instead of using vague references.

Metaphors and idioms can help conceptual teaching.
A requirement or instruction must remain complete when the metaphor or idiom is removed.

## Construct explicit sentences

- Use active voice when the actor is known and relevant.
- Name the actor when responsibility could be unclear.
- State a condition before the action that depends on it.
- Put one requirement or one primary action in each sentence.
- Keep the action and its object together.
- Separate a requirement from its rationale and examples.
- Use positive instructions that name the supported behavior.
- Use a prohibition for a hard guardrail, and pair it with the supported alternative.
- Preserve causal words such as `because`, `so`, `but`, and `if` when they carry technical meaning.

Treat an instruction longer than 20 words as a mandatory review point.
Treat a descriptive sentence longer than 25 words as a mandatory review point.
Split the sentence when the split preserves the relationship between its ideas.
Keep a longer sentence when splitting it would hide an important condition, contrast, or cause.

## Write each type of prose

### Instructions

Write instructions in the imperative form.
Put prerequisites and conditions before the command.
Give one primary action in each numbered step.
State the expected result when the result is not obvious.

Use this pattern:

> If or when condition, perform action.
> Expected result.

Example:

Before:

> When a term is resolved, update `CONTEXT.md` right there and do not batch these up because they must be captured as they happen.

After:

> When the user resolves a term, update `CONTEXT.md` immediately.
> Record each resolved term before you continue the discussion.

### Requirements

Use these modal verbs consistently:

- `must` identifies a requirement.
- `should` identifies a recommendation.
- `may` gives permission.
- `can` identifies a capability or possible result.

Name the subject of the requirement.
Make the required state or behavior observable when possible.

Before:

> The context file should be totally devoid of implementation details.

After:

> `CONTEXT.md` must contain only domain terms and definitions.
> Record implementation decisions in the applicable technical documentation.

### Definitions

Start with the canonical term.
State what the term identifies.
Add the minimum boundary needed to distinguish it from related terms.
Keep a definition to one or two sentences when possible.

Example:

> A **Seam** is a location where a module exposes its interface.
> A caller can replace behavior at this location without changing the caller.

### Warnings

State the hazard or invalid state first.
State the consequence next.
State the prevention or recovery action last.
Use a warning only when the consequence justifies interruption.

### Explanations

Give each paragraph one topic.
Start with the fact or claim that controls the paragraph.
Add causes, consequences, or exceptions in a logical order.
Keep connected reasoning together when splitting it would make the relationship less clear.

## Organize information

- Use prose for connected reasoning.
- Use numbered lists for ordered actions.
- Use bullets for parallel facts or options.
- Use headings that name the subject or action of the section.
- Keep a rule beside its conditions and exceptions.
- Keep examples immediately after the rule they demonstrate.
- Keep normative language separate from background information.

## Review the result

Review every changed passage before completion.
Confirm all these statements:

- Each concept has one canonical term.
- Each instruction has one primary action.
- Each condition appears before the action that depends on it.
- Each requirement identifies its subject and required state or behavior.
- Each vague pronoun or reference has an unambiguous referent.
- Each metaphor in normative prose has a literal replacement.
- Each sentence above the length threshold was reviewed deliberately.
- Requirements, rationale, and examples are distinguishable.
- Exact technical text outside the requested changes remains unchanged.
- The rewrite preserves the original technical meaning.

The prose is complete when every applicable statement is true and the document-specific completion criteria are also satisfied.
