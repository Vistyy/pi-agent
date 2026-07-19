# Session Integrations

Use this reference when implementing hooks, plugins, or installable Agent Skills for an AXI CLI.

## Session lifecycle

1. Provide a user-invoked setup command that installs or repairs the session integration.
2. At session start, run the CLI and collect directory-scoped home-view data.
3. Inject that data as initial agent context.
4. At session end, record the session artifacts required by future context.

Example session-start context:

```toon
specs[2]{id,title,status}:
  1,Fix auth bug,open
  2,Add pagination,in-progress

help[2]:
  Run `mytool specs view 1` for details
  Run `mytool specs create --title "..."` to add a spec
```

## Integration requirements

- **Default app targets**: Support Claude Code, Codex, OpenCode, and Pi when each harness can run the integration.
- **Explicit opt-in**: Install hooks or plugins only through a user-invoked setup command.
- **Portable commands**: Use a PATH-resolved binary when it resolves to the current executable.
  Otherwise, use the current executable's absolute path.
- **Path repair**: During setup, replace a stale executable path in an existing integration.
- **Idempotence**: Repeating setup with the same path must be a silent no-op and return success.
- **Directory scope**: Include only state associated with the current working directory.
- **Token budget**: Include the item identity, status, and commands required to select the next action.
  Keep detailed bodies and historical data behind explicit CLI commands.
- **Lifecycle capture**: At session end, record available transcript locations, modified paths, and referenced specifications.

## Harness integration

- **Claude Code**: Use native hooks in `~/.claude/settings.json` or project `.claude/settings.json`.
  Use `SessionStart` to inject context through stdout.
- **Codex**: Use native hooks in `~/.codex/hooks.json` or `<repo>/.codex/hooks.json`.
  Set `[features].hooks = true` in `config.toml`.
  Use `SessionStart` to inject context through stdout.
- **OpenCode**: Use a managed plugin in `~/.config/opencode/plugins/`.
  Inject the home view as ambient system context.
- **Pi**: Use a Pi extension from a Pi package, `~/.pi/agent/extensions/`, or `.pi/extensions/`.
  Run or cache the CLI during `session_start`.
  Inject context with `pi.sendMessage()` or `before_agent_start`.
  Record transcript locations, modified paths, and referenced specifications during `session_shutdown`.
  Guard UI behavior with `ctx.mode` or `ctx.hasUI`.

## Installable Agent Skill

Provide an installable [Agent Skill](https://agentskills.io) as an on-demand discovery option.
It supports harnesses that implement the skill format without requiring per-session context.
Users can install the session integration, the skill, or both.

```sh
pnpx skills add <owner>/<repo> --skill <name>
```

- **Single source of truth**: Generate `SKILL.md` from the same static command guidance as the no-argument home view.
  Exclude live state.
  Add a CI `--check` step that fails when the committed skill differs from the generated skill.
- **Static content**: Keep open sessions, current items, and other live data out of `SKILL.md`.
- **Executable commands**: Write examples that run without a global installation, such as `pnpx -y mytool ...`.
- **Invocation description**: State the user intent that must load the skill.
- **Installation guidance**: Document the session integration and skill as two supported installation options.
