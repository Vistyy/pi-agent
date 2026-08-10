# Session Integrations

## Session lifecycle

When session integration is selected:

1. Provide a user-invoked setup command that installs or repairs the session integration.
2. At session start, run the CLI and collect directory-scoped home-view data.
3. Inject that data as initial agent context.
4. At session end, record the session artifacts required by future context.

Example session-start context:

Render this context in the CLI's selected output format.
Do not assume TOON.
Use TOON only after the user or project explicitly selects and approves it; then use it consistently.

```text
specs: 2 records
  id: 1; title: Fix auth bug; status: open
  id: 2; title: Add pagination; status: in-progress
help:
  Run `mytool specs view 1` for details
  Run `mytool specs create --title "..."` to add a spec
```

## Integration requirements

- **Per-harness approval**: Obtain explicit user or project approval for each target harness before setup or implementation.
  Do not assume support for Claude Code, Codex, OpenCode, or Pi.
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

The following harness guidance applies only after that harness has individual user or project approval.

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

When an installable Agent Skill is an approved delivery option, provide it as an on-demand discovery option for harnesses that implement the [Agent Skills standard](https://agentskills.io).

```sh
pnpx skills add <owner>/<repo> --skill <name>
```

- **Static source of truth**: Keep `SKILL.md` command guidance aligned with established static CLI guidance.
  Keep open sessions, current items, and other live data out of `SKILL.md`.
- **Executable commands**: Write examples that run without a global installation, such as `pnpx -y mytool ...`.
- **Invocation description**: State the user intent that must load the skill.
- **Installation guidance**: Document each approved installation option.
