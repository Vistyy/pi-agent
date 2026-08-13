---
name: chrome-devtools-axi
description: "Use when interacting with a rendered web page, inspecting browser state, capturing screenshots, debugging console or network activity, auditing performance, or extracting page content."
disable-model-invocation: true
---

# chrome-devtools-axi

Run commands as `pnpx -y chrome-devtools-axi <command>`.
When output suggests `chrome-devtools-axi ...`, add the `pnpx -y` prefix before running it.

## Procedure

1. Open or select the page.
   If the task provides a URL, run `open <url>`.
   Run `pages` and use `selectpage <id>` to select the page that matches the task target.
   If no page matches, run `pnpx -y chrome-devtools-axi stop`, report the missing target, and stop.
   If several pages match, ask the user to select one before interacting.
   Run `snapshot` to get the current page state and element references.
   Completion: the target page is explicitly selected and the required references are current.

2. Interact with exact references.
   Use `click @<uid>`, `fill @<uid> <text>`, `fillform @<uid>=<val>...`, `hover @<uid>`, `drag @<from> @<to>`, or `upload @<uid> <path>`.
   Copy each complete reference from the snapshot, including its `g<N>:` generation prefix.
   Verify the resulting page state after each interaction.
   Completion: every requested interaction succeeded with a current reference and produced its expected observable result.

3. Handle interaction failures.
   If an action returns `STALE_REF`, run `snapshot` and retry the action with the new reference.
   For another action failure, capture the command output and current snapshot, run `pnpx -y chrome-devtools-axi stop`, report the blocked interaction, and stop.
   Completion: no requested action remains blocked, or the exact blocking failure and current page state are reported.

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

## Help

Use `pnpx -y chrome-devtools-axi --help` as the authority for available commands, global flags, and environment variables.
Use `pnpx -y chrome-devtools-axi <command> --help` for command-specific usage.

## Output controls

- Use grep or head to select specific data from a large page response.
- Add `--full` to snapshot-producing commands when the complete untruncated snapshot is required.
