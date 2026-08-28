---
name: writing-instructions
description: Use when writing, revising, or auditing instructions or technical documentation.
---

# Writing Instructions

Write technical prose that produces the required behavior or understanding without adding unsupported meaning.
When an instruction conditionally directs the reader to another file, state the loading condition before or with the reference in the referring file.
Do not introduce or repeat that condition inside the referenced file because discovery is already too late.
For a nested reference, its direct referring file owns the loading condition.
When the artifact's purpose is to explain or help readers operate the supported technical system, read [Documentation](references/DOCUMENTATION.md) completely.
Do not load that reference only because an instruction artifact uses Markdown or includes rationale.
When writing or reviewing a skill, also read [Writing skills](references/SKILLS.md) completely.

When the user requests an audit, do not change files.
Check every criterion applicable to the requested scope and report each material failure with its evidence and impact.
Report no material findings only after every applicable criterion has been checked.

## 1. Establish the target

Identify the artifact, audience, and behavior or question the prose must address.
Identify the authorities and constraints that govern the artifact.
Inspect the environment when correct content depends on existing behavior or conventions.
Resolve conflicting authorities before drafting.
Ask the user when no authority determines a consequential choice.
Leave local and reversible choices to the actor's judgment.

## 2. Place and write the content

Put each rule or claim at the lowest reliable delivery boundary.
Put interface-specific behavior where the actor encounters the interface.
Keep ordered actions and universally required rules in the primary artifact.
Keep required detail inline when a loading instruction would be unreliable.
Make required external guidance available, or state the dependency and what to do when it is unavailable.

State each condition before the action or claim that depends on it.
Give each ordered step one primary action.
State an observable result when completion would otherwise be unclear.
Name the actor or subject when responsibility could be unclear.
Make each requirement observable.
Use `must` for requirements, `should` for recommendations, `may` for permission, and `can` for capability or possible results.
State supported behavior before a prohibition that limits it.
Keep requirements and instructions distinct from rationale and examples.
State the general rule that determines what is included.
Do not represent an open-ended rule or judgment with a bare list, including a list embedded in a sentence.
When examples help, state the rule first and explicitly mark the examples as non-exhaustive.
Use a list as the complete definition only when an authoritative source establishes that it contains every possible item.

## 3. Remove unnecessary content

Keep each meaning in one authoritative location.
For every materially constraining or repeated statement, identify what established need rules out a weaker alternative.
Remove or weaken it when none does.
Remove content that serves no current purpose.
Remove an instruction that does not change what the actor would otherwise do.
Disclose conditional detail when keeping it inline makes the active instructions difficult to use.

## 4. Validate the result

Trace every materially distinct applicable path from entry to completion.
For linear instructions, trace at least one representative case.
Test consequential or disputed behavior with the intended actor when the environment supports it.
Confirm that the result preserves all intended meaning and necessary relationships.
Record assumptions that cannot be tested.

The work is complete when the artifact addresses its intended behavior or question, each meaning has one authority, every applicable path satisfies its observable completion conditions, and each untested assumption is explicit.
An audit is complete when every failed criterion identifies its evidence and impact and no file has changed.
