---
name: chrome-devtools-axi
description: "Control a real Chrome browser through chrome-devtools-axi. Use for browser interaction, rendered page inspection, screenshots, console/network debugging, performance audits, or content extraction."
---

# chrome-devtools-axi

Use this instead of ad hoc browser automation when a task needs a real rendered page.

Invoke it with `pnpx -y chrome-devtools-axi <command>`.
If chrome-devtools-axi output shows a follow-up command starting with `chrome-devtools-axi`, run it as `pnpx -y chrome-devtools-axi ...` instead.

## Procedure

1. Navigate or inspect first.
   Run `pnpx -y chrome-devtools-axi open <url>` when the task gives a URL; otherwise run `snapshot` or `pages` to find the current page.
   Completion: you have the current page state and any needed `uid=` refs.
2. Interact by exact ref: `click @<uid>`, `fill @<uid> <text>`, `fillform @<uid>=<val>...`, `hover @<uid>`, `drag @<from> @<to>`, `upload @<uid> <path>`.
   Completion: every requested interaction has been attempted with refs copied exactly as printed, including the `g<N>:` generation prefix.
3. Refresh stale refs.
   If an action fails with `STALE_REF`, run `snapshot` and retry with fresh refs.
   Completion: no action is blocked by a known stale ref.
4. Use branch commands only when the task calls for them: `screenshot <path>` for pixels, `eval <js>` for JavaScript, `console` or `network` for debugging, `lighthouse` or `perf-start`/`perf-stop` for performance.
   Completion: every requested browser branch has produced the needed observation or artifact.
5. When output includes a next-step hint, prefer that command unless the task requires a different branch.
   Completion: no relevant hinted follow-up remains unexplored.

## Session lifecycle

The first command auto-starts a persistent bridge, so the browser session survives across invocations.
Run `pnpx -y chrome-devtools-axi stop` when finished.

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

Run `pnpx -y chrome-devtools-axi --help` for flags and environment variables, or `pnpx -y chrome-devtools-axi <command> --help` for per-command usage.

## Tips

- Pipe output through grep/head to extract specific data from large pages.
- Add `--full` to snapshot-producing commands to disable truncation.
