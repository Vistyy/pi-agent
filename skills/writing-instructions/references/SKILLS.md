# Writing Skills

A skill makes an agent follow a predictable process while allowing different outputs.

## Select the invocation mode

A **model-invoked** skill exposes its description to the agent and can load without user action.
Make the skill model-invoked when the agent must select it without user action:

- Omit `disable-model-invocation`.
- Describe each distinct trigger branch once.
- Remove synonyms that describe the same trigger.
- Start the description with a leading word when the leading word improves invocation.
- Keep behavior and background information in the skill body.

A model-invoked description adds permanent context load.
The frontmatter description is the single source of truth for model routing.
Do not repeat skill invocation conditions in `AGENTS.md`, other global instructions, or another skill.
If model routing is incomplete, correct the frontmatter description.
The description is complete when every required trigger branch appears once.

Do not use cross-skill references as the default routing mechanism.
State the required capability and result in shared language.
Let the agent select an applicable skill from the available frontmatter descriptions.
This permits another skill to provide the same capability without requiring the same skill name.
Name or link another skill only when the workflow depends on that skill's exact contract or artifact and a substitute would be invalid.
A necessary cross-skill reference must state the dependency instead of repeating the referenced skill's policy or invocation conditions.

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
The description must define the largest applicability region that remains correct.
Include every required trigger branch, exclude adjacent non-matching tasks, and omit conditions that are not needed for routing.
Do not summarize the skill's behavior or background.

Context load is the permanent agent-context cost of a model-invoked description.
Use the shortest wording that preserves that applicability boundary.

This section is complete when the agent can distinguish matching tasks from adjacent non-matching tasks by reading only the description.

## Build the skill information hierarchy

Put ordered actions in the primary `SKILL.md` steps.
Put universally required rules and facts in `SKILL.md` reference.
Put branch-specific skill material in **disclosed reference** behind a precise context pointer.
Put shared material that needs no independent invocation in **external reference** behind a precise context pointer.
The [writing-instructions glossary](GLOSSARY.md#disclosed-reference) defines both reference types.

A skill can contain only steps, only reference, or both.
When a skill has steps, unrelated reference can hide the current action and weaken attention.

### Represent fixed procedures in scripts

If the agent would otherwise reconstruct a fixed procedure from prose, provide a script in the skill's `scripts/` directory.
The script must perform the procedure.
Use a script only when the procedure does not require task-specific judgment.

Put the condition for invoking the script, its task-specific inputs, and the judgment applied to its result in `SKILL.md`.
Put validation, repeated tool calls, state handling, and other fixed mechanics in the script.
Make the script return the facts that the agent needs for the next decision.

This section is complete when every action and reference is at the lowest reliable level and each step has a sufficient completion criterion.
Each applicable fixed procedure that would otherwise require reconstruction must also be in a script.

## Define recurring outputs

When a skill repeatedly produces the same kind of user-facing result, define a stable output contract so recurring information appears in the same place across invocations.
Fix the ordering and representation of recurring fields.
Use tables for repeated comparable records and headings for connected reasoning.
Do not standardize outputs whose structure materially depends on the task.
Preserve a user-requested format unless the skill requires its format for predictable operation.

This section is complete when recurring information has a predictable location and the format does not force unrelated content into the same structure.

## Split only at a useful seam

Granularity is the degree to which capabilities are divided among skills.
Each split adds context load or cognitive load.

Split by invocation when a distinct leading word must trigger independently.
Split by invocation when the capability must be selected independently.
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
