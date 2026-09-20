# Tuicr review

`tuicr_review` opens one guided Tuicr review for an exact committed comparison in a dedicated, unfocused Herdr tab. It returns when the review is ready while completion monitoring continues in the Pi process.

## Prerequisites and input

- Pi is running inside Herdr.
- `herdr` and `tuicr` are available on `PATH` (or through `HERDR_BIN_PATH` and `TUICR_BIN_PATH`).
- The selected `cwd`, defaulting to Pi's current directory, is a Git repository containing both revisions.

Provide `base`, `head`, and the required boolean `replaceExisting`. The extension resolves both names to full commit IDs before launch and gives Tuicr only the exact `<base>..<head>` range. Working-tree targets and general revision-set input are not supported.

## Guided annotations

Annotations are optional. Use them candidly to explain intent or constraints, surface meaningful risks or trade-offs, highlight a non-obvious decision, or ask a focused question. Choose the narrowest useful review, file, line, or range scope. Line and range annotations can select the `old` or `new` side.

Only one owned review can be live. With `replaceExisting: false`, a same-comparison call reuses it and a different comparison is rejected. With `replaceExisting: true`, either can be restarted or replaced. Explicit replacement first reads and returns all saved Maintainer feedback for the old exact comparison, then closes only the owned old tab and private data before opening the new comparison. If opening fails, the tool error still returns that saved feedback. Comments and unsaved editor text are not migrated or inferred.

## Feedback and lifecycle

Each review receives a private `XDG_DATA_HOME`. The extension retains the exact commit IDs, Herdr tab, pane, and Tuicr session it created, and launches Tuicr with `--stdout` and `--no-update-check` without focusing the tab.

Completed feedback names the exact comparison. Maintainer line and range comments include their verbatim text, exact revision, side, path, range, and a bounded excerpt read from Git with cited lines marked `>>`. Unresolvable paths, revisions, or ranges report an explicit reason and no guessed code. Review and file comments remain at their actual scope.

When Tuicr exits, the extension reads the exact session's comments, persists feedback, closes only its owned tab, removes only its private data, and sends one visible follow-up. Tuicr may remove an empty successful session; that documented exit-0 case completes with zero comments. Other read failures preserve owned resources and report failure.

A compact active record allows the owning Pi session to resume monitoring. A compact finished record and stable delivery identity allow undelivered feedback to replay after resume. Shutdown and reload detach monitoring without closing the review.

## Accepted limitations

- Initial launch is not recoverable if Pi terminates before readiness is recorded.
- Recovery is not guaranteed after reboot, temporary-directory deletion, or when the owning Pi session is never resumed.
- A narrow crash race between queueing feedback and Pi persisting that exact message can duplicate the follow-up.
- Cleanup is best effort; reported failures may leave the owned tab or private temporary directory behind.
