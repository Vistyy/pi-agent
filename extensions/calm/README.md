# Calm

An inline Pi extension. Calm hides model tool calls, tool results, and thinking from the main transcript. Assistant text, user messages, and native notices remain visible. Session data and tool execution stay unchanged.

Pi discovers `index.ts` from the global `extensions/calm` directory. No package entry, package manifest, or dependency installation is required. The extension uses Node built-ins and the libraries supplied by Pi.

## Controls

| Command | Effect |
| --- | --- |
| `/calm` | Toggle Calm for the current session. |
| `/calm default on` | Enable Calm by default in new sessions. |
| `/calm default off` | Disable Calm by default in new sessions. |

The initial default is on. A session keeps its own choice across reloads and restarts. Changing the startup default does not change the current session.

Session choices use `pi-calm-preference` entries in the native session file. The startup default uses the `calm-default` file in Pi's agent directory. Preference writes replace that file atomically without editing `settings.json`.

## Activity rail

The rail occupies one line while work or an input prompt is active. It disappears at idle.

- Up to three recent outcomes appear on the left. `✓` means the tool completed without an error flag. A warning-colored `×` means the tool reported failure.
- The active section appears toward the right. A static accent-colored `●` identifies the oldest active tool, thinking, responding, or awaiting input.
- Parallel calls add a count of the other active calls. The rail does not select whichever call most recently emitted an event.
- Read, edit, and write entries retain bounded filename hints. Full paths and command output remain in the underlying transcript.
- An active tool shows its own elapsed time. Total elapsed time stays at the right edge. The timer requests a redraw once per second while the rail is visible.
- Older completed entries disappear first at narrower widths. Extremely narrow terminals retain a clipped live label instead of overflowing.

Successes and elapsed time use dim or muted theme colors. Active text uses the normal foreground. Only the active dot and failure markers receive accent or warning colors. There is no blinking or animation.

A failed tool marker does not mean the whole task failed. A later successful call does not mark an earlier failure as recovered.

## Runtime boundary

Calm adapts one main-chat container. It does not patch shared component prototypes or replace executable tools. PStack's separate subagent transcript renderer remains unfiltered. RPC sessions skip presentation initialization.

The adapter reads private Pi presentation metadata. If discovery or classification fails, Calm restores native rendering and displays a warning. Pi 0.86.1 is the verified runtime. Other versions require the same native verification.

`projection.ts` owns filtering and fallback. `pi-runtime.ts` locates the running Pi's exact component constructors. `activity.ts` owns the bounded activity state and row layout. `index.ts` owns session lifecycle and commands. `preferences.ts` owns default persistence.

The projection and runtime discovery derive from Workgraph's MIT-licensed Calm implementation at commit `964177a3d20751766cfd3672bbdb5575464be069`. The original license is retained in `LICENSE`. This extension has no Workgraph or PStack runtime dependency. Workgraph-specific custom-message filtering and worker tracking are not included.

## Verification

`tests/verify.py` runs the installed Pi CLI with an isolated agent directory and a scripted local provider. It uses real read and edit calls, parallel fixture tools, native commands, and saved transcripts. It requires Python and tmux. It does not invoke a paid model or execute a child agent.

The following commands run from this directory:

```sh
python3 tests/verify.py
python3 tests/verify.py --mode regular
python3 tests/verify.py --pstack /path/to/pi-pstack
```

`--pstack` adds the real PStack extension and checks `/subagents` against a saved child fixture while Calm is on. The observer check does not delegate work.

Each run prints its temporary evidence directory. That directory contains screen captures, terminal output, session files, and the result list. The script exits its owned Pi processes and private tmux server. The fixture in `tests/fixture.ts` loads only when explicitly requested by the verification script. Image rendering, mouse selection, and long-history frame costs are not covered by this script.
