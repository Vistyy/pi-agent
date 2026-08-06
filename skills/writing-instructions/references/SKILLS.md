# Writing Skills

A skill makes an agent follow a predictable process while allowing task-specific judgment and different valid outputs.

## Select the invocation mode

Use a model-invoked skill when the agent must select the capability without user action:

- Omit `disable-model-invocation`.
- Describe each distinct trigger once in the frontmatter description.
- Keep behavior and background information out of the description.

Use a user-invoked skill when explicit user choice is part of the behavior:

- Set `disable-model-invocation: true`.
- Prefix the human-facing description with `[M] `.

Do not repeat invocation conditions in `AGENTS.md`, another skill, or other global instructions.
Do not use cross-skill references for routing when the frontmatter descriptions can independently select the required capabilities.
Name another skill only when the workflow depends on that skill's exact contract or artifact.

## Define the description

Treat a model-invoked description as the routing boundary, not a summary.
Describe the broadest class of tasks for which loading the skill is correct.
Add a condition only when it excludes an adjacent task that should not load the skill.
Include every distinct trigger branch once and omit details that do not affect routing.
Use the shortest wording that preserves that boundary because every model-invoked description adds permanent context.

## Organize the skill

Use a script when the agent would otherwise reconstruct a fixed procedure from prose.
The script must perform only fixed mechanics that do not require task-specific judgment.
State when to run the script, its task-specific inputs, and how to use its result in `SKILL.md`.

When a skill repeatedly produces the same user-facing result, define a stable output contract.
Fix only the fields and ordering that must remain predictable.
Do not force task-dependent content into a uniform structure.

## Split only when the split changes invocation or execution

Split a capability when it must be invoked independently.
Do not split shared guidance that has no independent invocation need.
Split a sequence only after agents continue to stop early despite a precise completion condition.
A sequence split must hide the later steps from the current actor, such as through a bounded subagent assignment or separate-session handoff.

## Validate the skill

Test the description against representative matching and adjacent prompts when the harness supports it.
Confirm that branch-specific references load only under their intended conditions.
When replacing a skill path, confirm that no replaced path remains.

The skill is complete when the description covers each required task and excludes adjacent tasks, every invocation branch reaches the required behavior, and each untested routing assumption is explicit.
