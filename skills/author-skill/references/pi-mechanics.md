# Pi skill mechanics

This reference contains the native mechanics used by the authoring workflow. Check locally installed Pi documentation only if runtime behavior differs or additional configuration or package details are needed. Avoid assuming another host's frontmatter, scaffolding, command syntax, or permission model applies to Pi.

## Format

Prefer a directory containing `SKILL.md`, with YAML frontmatter followed by Markdown instructions:

```markdown
---
name: example-skill
description: State what the skill does and the concrete situations that require it.
---

# Perform the task

Write the instructions here.
```

Names use lowercase letters, digits, and hyphens, with no leading, trailing, or consecutive hyphens. The maximum is 64 characters. Descriptions have a maximum of 1024 characters.

Keep the directory and name matched for portability. Pi currently tolerates a mismatch, but other Agent Skills hosts may not. A collision keeps the first discovered skill and produces a warning, so inspect existing names before adding a new one.

## Invocation

With normal model invocation, Pi advertises the name, description, and path, not the full body. The model chooses when to read the instructions. A matching description does not guarantee selection.

To make selection explicit-only, retain a description and add:

```yaml
disable-model-invocation: true
```

This removes the skill from automatic model selection. It is not file-access control: a known path can still be read. Respect an explicit-only skill's intended user-controlled invocation instead of routing around that choice through another skill.

The user can invoke `/skill:<name>`. Text after the command is appended as the request. The `enableSkillCommands` setting controls command discovery, but manually entered skill commands still work.

## Files and placement

Use an existing configured user or project skills location. Standard locations are `~/.pi/agent/skills/` for user skills and `.pi/skills/` for project skills. Pi also supports `~/.agents/skills/` and project `.agents/skills/` directories. Pi discovers directories containing `SKILL.md` recursively. Do not add a new configured directory when an existing one fits.

Resolve bundled file paths relative to the skill directory. State when each reference should be read and show how each helper is run. Declare actual environment requirements; frontmatter is not a substitute for available tools or authorization.

## Native validation

1. Inspect the actual `SKILL.md`, frontmatter, and referenced files. Confirm local links resolve and required helpers and assets exist.
2. Load resources from the location and configuration a real caller uses. Inspect startup or resource-loader diagnostics and check for missing descriptions or name collisions.
3. For model-invocable skills, confirm the expected metadata is advertised. For explicit-only skills, confirm it is excluded from that catalog.
4. Check `/skill:<name>` delivery separately, including the full instructions, skill-directory context, and supplied arguments.
5. Run `/reload` after changes in an active session before checking its updated catalog or command discovery.

Use existing native SDK/resource checks when available. A deterministic stand-in model can verify instruction delivery without making a paid request, but it cannot demonstrate selection decisions or execution quality.

Record structural/loading results separately from real-task evidence. A skill that loads correctly but has not been exercised is not behavior-verified.

## Basis

These mechanics were checked against Pi 0.99.1. For another version, verify any differences against the installed runtime.
