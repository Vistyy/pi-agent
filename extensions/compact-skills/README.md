# Compact skill catalog

This extension replaces Pi's model-facing skill catalog with one line per skill. Descriptions stay unchanged. Each group declares a root directory, and the model loads `<root>/<name>/SKILL.md`.

Pi still discovers skills and supports `/skill:name`. Full instructions load on demand. The extension uses the public `before_agent_start` event and overrides only `systemPromptOptions.sections.skills`.

If an advertised skill has a nonstandard file path, an ambiguous name, or multiline text, the extension keeps Pi's native catalog for that turn. It does not trim descriptions or invent file paths. Explicit-command-only skills remain excluded from model selection.

## Activate or disable it

New sessions discover this extension automatically. Run `/reload` in an existing session to load it. Start a fresh session to avoid carrying the old catalog in conversation history.

To restore the native catalog, disable this extension in `pi config`, then reload or start a fresh session. Removing this extension directory also restores the native catalog on the next reload.

## Check the renderer

From `~/.pi/agent`, run:

```bash
node --experimental-strip-types --test extensions/compact-skills/catalog.test.ts
```

The tests cover unchanged descriptions, path reconstruction, discovery order, command-only skills, unsupported layouts, and activation with either `read` or `bash`.
