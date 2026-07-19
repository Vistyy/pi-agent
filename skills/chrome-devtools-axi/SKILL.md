---
name: chrome-devtools-axi
description: "Use when interacting with a rendered web page, inspecting browser state, capturing screenshots, debugging console or network activity, auditing performance, or extracting page content."
---

# chrome-devtools-axi

Use `chrome-devtools-axi` when a task requires a real rendered page.

Run commands as `pnpx -y chrome-devtools-axi <command>`.
When output suggests `chrome-devtools-axi ...`, add the `pnpx -y` prefix before running it.

## Procedure

1. Open or select the page.
   If the task provides a URL, run `open <url>`.
   Otherwise, run `pages` and use `selectpage <id>` when more than one page is available.
   Run `snapshot` to get the current page state and element references.
   Completion: the selected page and required references are explicit.

2. Interact with exact references.
   Use `click @<uid>`, `fill @<uid> <text>`, `fillform @<uid>=<val>...`, `hover @<uid>`, `drag @<from> @<to>`, or `upload @<uid> <path>`.
   Copy each complete reference from the snapshot, including its `g<N>:` generation prefix.
   Completion: every requested interaction has been attempted with a current reference.

3. Refresh stale references.
   If an action returns `STALE_REF`, run `snapshot`.
   Retry the action with the new reference.
   Completion: no requested action remains blocked by a known stale reference.

4. Run the optional command required by the task.
   Use `screenshot <path>` for rendered pixels.
   Use `eval <js>` for JavaScript evaluation.
   Use `console` or `network` for debugging.
   Use `lighthouse` or `perf-start` and `perf-stop` for performance analysis.
   Completion: each requested observation or artifact exists.

5. Follow relevant hints.
   Run a hinted command when it produces evidence or an artifact for the requested browser task without expanding its scope.
   Completion: no relevant hinted command remains.

## Session lifecycle

The first command starts a persistent bridge.
The browser session remains available across commands.
After all requested browser observations and artifacts are complete, run `pnpx -y chrome-devtools-axi stop`.

## Commands

```
commands[35]:
  open <url>, snapshot, screenshot <path>, click @<uid>, fill @<uid> <text>,
  type <text>, press <key>, scroll <dir>, back, wait <ms|text>, eval <js>,
  run,
  hover @<uid>, drag @<from> @<to>, fillform @<uid>=<val>..., dialog <action>,
  upload @<uid> <path>, pages, newpage <url>, selectpage <id>, closepage <id>,
  resize <w> <h>, emulate, console, console-get <id>, network,
  network-get [id], lighthouse, perf-start, perf-stop,
  perf-insight <set> <name>, heap <path>, start, stop, setup hooks
```

Run `pnpx -y chrome-devtools-axi --help` for global flags and environment variables.
Run `pnpx -y chrome-devtools-axi <command> --help` for command-specific usage.

## Output controls

- Use grep or head to select specific data from a large page response.
- Add `--full` to snapshot-producing commands when the complete untruncated snapshot is required.
