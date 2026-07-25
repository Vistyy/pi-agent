# Writing Skills

Read this reference when writing, revising, or auditing a skill.
A skill makes an agent follow a predictable process while allowing different outputs.

## Select the invocation mode

A **model-invoked** skill exposes its description to the agent and can load without user action.
Make the skill model-invoked when the agent or another skill must find it without user action:

- Omit `disable-model-invocation`.
- Describe each distinct trigger branch once.
- Remove synonyms that describe the same trigger.
- Start the description with a leading word when the leading word improves invocation.
- Keep behavior and background information in the skill body.

A model-invoked description adds permanent context load.
The description is complete when every required trigger branch appears once.

A **user-invoked** skill hides its description from the agent and can load only when the user invokes it by name.
Make the skill user-invoked when explicit user choice is part of its behavior:

- Set `disable-model-invocation: true`.
- Write a short human-facing description.
- Prefix the description with `[M] `.

A user-invoked skill adds cognitive load because the user must remember it.
The agent and other skills cannot discover or invoke a user-invoked skill.
A user can also invoke a model-invoked skill explicitly.

This section is complete when the frontmatter, description, and invocation behavior match the selected mode.

## Define the description

A model-invoked description is the machine-readable trigger that points from the agent context to the skill.
Its wording determines when the agent loads the skill.
The description must identify every distinct invocation condition without summarizing the skill's behavior or background.

Context load is the permanent agent-context cost of a model-invoked description.
Use the shortest description that preserves complete trigger coverage.

This section is complete when the agent can distinguish matching tasks from adjacent non-matching tasks by reading only the description.

## Build the skill information hierarchy

Put ordered actions in the primary `SKILL.md` steps.
Put universally required rules and facts in `SKILL.md` reference.
Put branch-specific skill material in **disclosed reference** behind a precise context pointer.
Put shared material that needs no independent invocation in **external reference** behind a precise context pointer.
The [writing-instructions glossary](GLOSSARY.md#disclosed-reference) defines both reference types.

A skill can contain only steps, only reference, or both.
When a skill has steps, unrelated reference can hide the current action and weaken attention.

This section is complete when every action and reference is at the lowest reliable level and each step has a sufficient completion criterion.

## Split only at a useful seam

Granularity is the degree to which capabilities are divided among skills.
Each split adds context load or cognitive load.

Split by invocation when a distinct leading word must trigger independently.
Split by invocation when another skill must reach the capability independently.
Consider a sequence split only after visible post-completion steps cause observed premature completion.
Strengthen the current completion criterion before a sequence split.
Use a sequence split only when a precise criterion cannot prevent the observed failure.
A sequence split must create a real context boundary.

This section is complete when each split has an independent invocation need or an observed sequence failure.

## Validate the skill

Trace each description branch to the applicable steps and references.
Confirm that every context pointer states the condition for loading its target.
Confirm that every step has a checkable completion criterion.
Test disputed invocation or execution behavior with representative prompts when the harness supports such tests.

The skill is complete when every invocation branch reaches the required behavior, all applicable writing-instructions criteria pass, and no replaced path remains.
