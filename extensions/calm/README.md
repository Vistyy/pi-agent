# Calm

An inline Pi extension. Calm hides model tool calls, tool results, thinking, and PStack child report receipts from the main transcript. Assistant text, ordinary user messages, and native notices remain visible. Session data and tool execution stay unchanged.

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

```text
⠋ Thinking   24s · read activity.ts
⠋ Running    26s · bash
⠋ Responding 31s
```

- The entire rail stays near the left edge. The phase has a ten-column field, so elapsed time always starts in column fourteen. Variable-length details follow the clock.
- The spinner advances every 80 milliseconds, matching Pi's default loader. It uses the active theme's thinking-level color, as Pi's normal editor spinner does. The phase describes model activity as Thinking, or Responding when text is streamed. There is meaningful status text even before a tool runs.
- Calls become primary activity only after running for at least 500 milliseconds. Running shows the oldest sustained call and a count of the other sustained calls. Brief calls do not flash the primary status or parallel count.
- Otherwise, details retain the most recently completed call without a prefix or outcome marker. Only one completed call is retained.
- Input prompts show a stationary `?`, Waiting, and "for input". Closing the prompt restores the prior activity context.
- Read, edit, and write calls retain bounded filename hints. Full paths and command output remain in the underlying transcript.
- There is one elapsed time for the whole run. There are no per-tool stopwatches or "total" label.
- Narrower terminals truncate the row without wrapping or moving the clock. At widths too small to contain the clock, only the beginning of the status is shown.

Phase and time remain muted, and details are dim. Spinner color follows live theme and thinking-level changes. The rail contains no success checkmarks, failure counts, or failed-call annotations. The redraw timer stops when the rail is hidden or the run settles.

Pi-level warnings, errors, cache notices, and reload messages remain visible. Warning text inside a tool result stays hidden with that result until Calm is turned off.

## PStack report rows

When waking an idle parent, PStack delivers a child's final report as a user row that starts with `PSTACK_CHILD_REPORT_V1` and a newline, followed by one JSON object with exactly `id`, `attempt`, `status`, and `report`. The report is either `{kind: "full", text}` or `{kind: "preview", text, omittedBytes}`. With Calm on, the projection hides rows that match that envelope whole, in both report forms.

Hiding changes rendering only. The stored session message and the text the model receives stay byte for byte identical with Calm on and off.

Rows that merely resemble the envelope keep their row. An extra or missing property, a fractional or zero attempt, another version prefix, malformed JSON, plain JSON without the prefix, and ordinary typed text all stay visible. Text whose private `text` field Calm cannot read also stays visible, so an unknown Pi field never disables Calm.

Calm off renders every row natively. Busy PStack receipts are custom messages with `display=false`, which Pi does not render, so Calm needs no custom-message filter.

## Runtime boundary

Calm adapts one main-chat container. It does not patch shared component prototypes or replace executable tools. PStack's separate subagent transcript renderer remains unfiltered. RPC sessions skip presentation initialization.

The adapter reads private Pi presentation metadata. If discovery or classification fails, Calm restores native rendering and displays a warning. Pi 0.86.1 is the verified runtime. Other versions require the same native verification.

`projection.ts` owns filtering and fallback. `completion-report.ts` owns PStack report envelope recognition. `pi-runtime.ts` locates the running Pi's exact component constructors. `activity.ts` owns the bounded activity state and row layout. `index.ts` owns session lifecycle and commands. `preferences.ts` owns default persistence.

The projection and runtime discovery derive from Workgraph's MIT-licensed Calm implementation at commit `964177a3d20751766cfd3672bbdb5575464be069`. The original license is retained in `LICENSE`. This extension has no Workgraph or PStack runtime dependency. Workgraph-specific custom-message filtering and worker tracking are not included.

## Verification

`tests/verify.py` runs the installed Pi CLI with an isolated agent directory and a scripted local provider. It uses real read and edit calls, parallel fixture tools, native commands, saved transcripts, and PStack report envelopes checked with Calm on, off, across a restart, and after a reload. It requires Python and tmux. It does not invoke a paid model or execute a child agent.

The following commands run from this directory:

```sh
python3 tests/verify.py
python3 tests/verify.py --mode regular
python3 tests/verify.py --pstack /path/to/pi-pstack
```

`--pstack` adds the real PStack extension and checks `/subagents` against a saved child fixture while Calm is on. The observer check does not delegate work.

Each run prints its temporary evidence directory. That directory contains screen captures, terminal output, session files, and the result list. The script exits its owned Pi processes and private tmux server. The fixture in `tests/fixture.ts` loads only when explicitly requested by the verification script. Image rendering, mouse selection, and long-history frame costs are not covered by this script.
