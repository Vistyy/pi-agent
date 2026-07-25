---
name: writing-instructions
description: Use when writing, revising, or auditing agent instructions, agent prompts, AGENTS.md files, skills, or normative technical documentation.
---

# Writing Instructions

Write instructions that produce predictable behavior while preserving judgment where context determines the correct action.
Before writing, revising, or auditing instructions, load and apply the `technical-prose` skill.
When a bold term controls a decision, read its authoritative definition in [the glossary](references/GLOSSARY.md) before making that decision.

When the user requests an audit, evaluate the existing instructions against every step and completion criterion without changing them.
Report each failed criterion and the evidence that supports the finding.

## 1. Define the required behavior

Name the instruction artifact, its actor, and its intended audience.
State the observable behavior that the instructions must produce.
Identify the conditions, scope, authority, and invariants that control that behavior.
Inspect the applicable environment and existing instructions for local conventions and conflicts.

When correct behavior depends on local conventions, direct the actor to inspect and follow those conventions.
Use unconditional rules for invariants, safety constraints, compliance requirements, and exact output requirements.
When local conventions are absent or incomplete, use the applicable invariant or explicit requirement.
When no authority determines a consequential choice, ask the user for clarification.
Leave local and reversible choices to the actor's judgment.
Resolve conflicting authorities before drafting instructions.

This step is complete when the actor, audience, observable behavior, scope, controlling context, invariants, fallback behavior, and authority precedence are explicit.

## 2. Place each instruction at the lowest reliable level

Before placing content, read [Information hierarchy](references/GLOSSARY.md#information-hierarchy).

Put interface-specific behavior at the **interface boundary**.
Put tool usage in the tool description, valid states in the schema, and file-specific rules beside the applicable files.
Keep global instructions for behavior that applies across interfaces or files.

Place content according to when the actor needs it:

1. Put ordered actions in in-scope **steps**.
2. Put universally required rules and facts in in-scope **reference**.
3. Put branch-specific material behind a precise **context pointer**.
4. Put shared material that needs no independent invocation in an external reference behind a precise context pointer.

Use **progressive disclosure** when only some branches need detailed material.
Keep required material inline when a precise context pointer does not load it reliably.
Use **co-location** within each file.
Keep each concept's definition, rules, and exceptions under one heading.

Select the highest-fidelity authoritative reference that directly expresses the required behavior or quality.
Prefer executable tests for behavior, representative code for implementation conventions, rendered artifacts for visual requirements, and rubrics for judgment-dependent quality.
State why and when the actor must consult each reference.
Resolve conflicts between references before relying on them.

When writing, editing, or auditing a skill, read [Writing skills](references/SKILLS.md) before evaluating its invocation mode or structure.

This step is complete when every instruction and reference is at the lowest reliable level, every context pointer states when to load its target, every selected reference has a stated purpose, and no unresolved reference conflict remains.

## 3. Construct the instructions

Give each step one primary action.
State each condition before the action that depends on it.
End each step with a checkable **completion criterion**.
When incomplete coverage matters, make the completion criterion exhaustive.
Use a **leading word** when an established compact concept controls behavior more reliably than a longer explanation.

Prefer interfaces, valid states, and explicit requirements over examples when they can define the behavior completely.
Use examples to clarify ambiguous boundaries and edge cases.
Do not use examples as the only definition of available operations or valid states.

This step is complete when each action has one object, each condition precedes its action, each step has a sufficient completion criterion, and each example clarifies rather than defines the available behavior.

## 4. Prune the instructions

Before pruning, read [Pruning](references/GLOSSARY.md#pruning).

Keep each meaning in one **single source of truth**.
Make each behavioral change through one authoritative edit.
Remove obsolete and irrelevant content.
Apply the **no-op** test to each sentence:

> Does this sentence change behavior from the default behavior?

Delete a sentence that fails the test.
A shorter no-op remains a no-op.
Disclose conditional material when active content creates **sprawl**.

This step is complete when each retained line changes or supports the required behavior, each meaning has one authority, no obsolete content remains, and conditional detail does not create sprawl.

## 5. Validate the behavior

Review every changed passage with the completion criteria from this skill and `technical-prose`.
Trace every applicable branch from invocation or entry through completion.
For linear instructions, trace at least one representative case.
Test consequential or disputed instructions against the intended actor when the environment supports such a test.
Record untested assumptions when behavioral testing is unavailable.

Classify observed failures before changing the instructions:

- For **premature completion**, strengthen the current completion criterion before splitting the sequence.
- For **duplication**, choose one authoritative location.
- For **sediment**, remove stale or irrelevant content.
- For **sprawl**, disclose conditional material or split a genuine branch or sequence.
- For a **no-op**, remove the instruction or replace it with an effective control.

The instructions are complete when every traced branch produces the required observable behavior, every applicable review criterion passes, and each untested assumption is explicit.
An audit is complete when every failed criterion identifies the applicable evidence and no file has changed.
