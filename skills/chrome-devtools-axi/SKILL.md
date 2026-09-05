---
name: chrome-devtools-axi
description: Use when browser interaction, rendered-page inspection, screenshots, or browser debugging requires Chrome DevTools AXI, or when configuring its sessions. Skip plain URL fetching and running existing browser test suites.
---

# Chrome DevTools AXI

Use the installed `chrome-devtools-axi` CLI through the shell.
Read `chrome-devtools-axi --help` and the relevant command's help for current syntax instead of downloading an unpinned replacement with `npx`.
Use ordinary content fetching when a real browser is unnecessary, and preserve existing project browser-test tooling.

## Session ownership

Choose a unique `CHROME_DEVTOOLS_AXI_SESSION` for each independent browser workflow and keep that name consistent across its commands.
For concurrent workflows, use independent browsers and profiles as well as separate named bridges.
Separate bridges attached to the same external browser do not establish browser isolation.

Inspect connection settings before starting a session.
Default isolated launch, attaching through `CHROME_DEVTOOLS_AXI_BROWSER_URL`, auto-connecting to the user's browser, and using `CHROME_DEVTOOLS_AXI_USER_DATA_DIR` have different ownership implications.
Do not inherit a shared browser or profile for an isolation check.
Do not globally set `CHROME_DEVTOOLS_AXI_PORT` for concurrent sessions; it overrides their independently derived ports.

Stop only a session whose lifecycle belongs to the current task, using the same session name with `chrome-devtools-axi stop`.
Do not close unrelated browsers or remove their profiles.

## Interaction

Use current snapshots to locate elements; refresh references after navigation or a stale-reference error.
If no page is selected, inspect `pages` and select the intended page rather than assuming a failed navigation had no effect.
CLI next-step hints are navigation aids, not authority to perform additional mutations.
