# Writing Skills

A skill supplies task-specific knowledge or methods that improve decisions without prescribing unnecessary steps.
Keep requirements and method guidance separate from the tools that execute work.
Do not create another owner for an existing method merely because a different coordination tool is available.

## Select ownership and placement

Choose the audience and owner before choosing invocation mode.
Use a global skill for guidance intended across the user's projects, a project skill for repository-specific knowledge, and a package skill for capabilities distributed with that package.
Follow the target harness's supported discovery paths and the repository's established layout.
Do not write to user-global directories merely because a skill is model-invoked or manually invoked.

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

## Separate references from independent capabilities

Keep the entry document focused on choosing the applicable method and its essential constraints.
Move supporting detail into references when a stated condition lets the reader avoid irrelevant material.
Splitting reference files does not create another skill or require a separate actor.

Create a separate skill when the capability must be invoked independently.
Do not split shared guidance that has no independent invocation need.
Split execution across actors only when independence, isolation, context, or another concrete boundary justifies the coordination cost.
If early stopping is the problem, clarify completion before introducing another actor.
Do not split an ordinary sequence into separately invoked skills merely to make the agent continue.

## Validate the skill

Test the description against representative matching and adjacent prompts when the harness supports it.
Confirm that branch-specific references load only under their intended conditions.
When replacing a skill path, confirm that no replaced path remains.

The skill is complete when the description covers each required task and excludes adjacent tasks, every invocation branch reaches the required behavior, and each untested routing assumption is explicit.
