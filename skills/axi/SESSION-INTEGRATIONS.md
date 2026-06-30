# Session integrations

Use this reference when implementing hooks, plugins, or installable Agent Skills for an AXI CLI.

## Session lifecycle pattern

1. Provide an explicit setup command that installs or repairs a session hook or plugin after user intent is clear.
2. At session start, the integration runs your tool and provides a compact dashboard as context.
3. The agent receives this as initial context and can act immediately.

Agent sees this at session start without invoking the tool:

```toon
specs[2]{id,title,status}:
  1,Fix auth bug,open
  2,Add pagination,in-progress

help[2]:
  Run `mytool specs view 1` for details
  Run `mytool specs create --title "..."` to add a spec
```

## Rules

- **Default app targets**: by default, support Claude Code, Codex, OpenCode, and Pi.
  Do not hard-code a single agent integration when the tool can reasonably support multiple agents.
- **Explicit opt-in**: register hooks or plugins only from a user-invoked setup command, not from ordinary CLI commands.
- **Portable commands**: hook commands should use a PATH-verified binary name when it resolves to the current executable, and fall back to the full absolute path otherwise.
  This keeps global installs portable while ensuring hooks do not accidentally run a different binary.
- **Path repair**: setup commands should check existing hooks and update the executable path if it has changed, for example after reinstall or relocation.
- **Idempotent**: repeated installs with the same path are silent no-ops.
- **Directory-scoped**: show only state relevant to the current working directory.
- **Token-budget-aware**: this context loads on every session.
  Ruthlessly minimize it.
  Include just enough for the agent to orient and act.
  Deep data belongs in explicit invocations.
- **Lifecycle capture**: use session-end hooks to capture what happened, such as transcripts, files touched, and specs referenced, so future session-start context gets richer over time.

## App integration notes

- **Claude Code**: use native hooks in `~/.claude/settings.json` or project `.claude/settings.json`.
  Prefer `SessionStart` to inject compact context via stdout.
- **Codex**: use native hooks in `~/.codex/hooks.json` or `<repo>/.codex/hooks.json`, and ensure `[features].hooks = true` in `config.toml`.
  Prefer `SessionStart` for ambient context via stdout.
- **OpenCode**: use a managed plugin in `~/.config/opencode/plugins/`.
  Prefer ambient system-context injection for the home view rather than adding a custom tool.
- **Pi**: use a Pi extension, distributed in a Pi package or installed into `~/.pi/agent/extensions/` or `.pi/extensions/`.
  Run or cache the CLI from `session_start`, inject compact context with `pi.sendMessage()` or `before_agent_start`, and capture session-end state in `session_shutdown`.
  Guard UI-only behavior with `ctx.mode` or `ctx.hasUI`.

## Installable Agent Skill

The session hook is the primary integration.
It gives ambient context plus live state, but it only helps agents whose harness supports hooks and it loads on every session.

Offer an installable [Agent Skill](https://agentskills.io) as a secondary discovery path.
It loads on demand when the agent recognizes a matching task, carries no per-session token cost, and works in any agent that supports the skill format.
The hook and skill are complementary.
A user installs whichever fits, or both.

```sh
pnpx skills add <owner>/<repo> --skill <name>
```

- **Single source of truth**: generate `SKILL.md` from the same static command guidance used by the no-args home view, excluding live state.
  Add a `--check` build step to CI that fails if the committed skill is stale.
- **Strip live state**: a skill is static, so omit dynamic data such as open sessions or current items that only the hook can show.
- **Non-interactive commands**: rewrite command examples to a form the agent can run without a global install, such as `pnpx -y mytool ...`, since a skill may be installed without the binary on PATH.
- **Trigger-shaped frontmatter**: include `name` and a `description` written as a trigger, terse and outcome-focused so the agent loads it on the right intent.
- **Document both paths**: in your README, present the hook and the skill as two ways to achieve the same thing, and make clear the user only needs one.
