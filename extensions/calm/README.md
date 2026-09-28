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

- The entire rail stays together on the left, including elapsed time and failure counts. A static accent-colored `●` indicates an active run or input prompt, not that a retained tool is still running.
- While tools run, the oldest active call is named, with a count of the other active calls. When none remain active, the most recently completed call stays visible with `✓` for completion or `×` for failure. Only one completed call is retained.
- Before any tool runs, the rail shows just the dot and elapsed time. There are no Working, Thinking, or Responding labels. An input prompt temporarily shows Awaiting input without discarding the retained call.
- Read, edit, and write calls retain bounded filename hints. Full paths and command output remain in the underlying transcript.
- An active tool shows its own elapsed time. A completed tool does not keep accruing time. Overall elapsed time follows the tool label without a "total" label. The timer requests a redraw once per second while the rail is visible.
- A warning-colored `×` and a count beside the clock report tool failures during the current run. Successful calls do not decrement the count.
- Narrower terminals truncate the live label without wrapping the row. Extremely narrow terminals retain only a clipped live label.

Elapsed time and the failure count use muted theme colors. Active text uses the normal foreground, and completed calls use dim text. Only the active dot and failure markers receive accent or warning colors. There are no pulsing indicators or display-delay timers.

The absence of active tools does not mean the run has finished. The retained call remains visible during model thinking and response generation. The rail follows Pi's run lifecycle and disappears when the run settles. A tool failure count does not mean the whole task failed.

Pi-level warnings, errors, cache notices, and reload messages remain visible. Warning text inside a tool result stays hidden with that result until Calm is turned off.

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
