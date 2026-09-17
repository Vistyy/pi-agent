# Tuicr review

`tuicr_review` opens one guided Tuicr review in a dedicated, unfocused Herdr tab. It returns when the review is ready while completion monitoring continues in the Pi process.

## Prerequisites

- Pi is running inside Herdr.
- `herdr` and `tuicr` are available on `PATH` (or through `HERDR_BIN_PATH` and `TUICR_BIN_PATH`).
- The selected `cwd`, defaulting to Pi's current directory, is a Git working tree Tuicr can review.

Use `target.kind: "workingTree"` for working-tree changes. Use `target.kind: "revisions"` with a `revset` for a revision range; `includeWorkingTree: true` adds current working-tree changes.

## Guided annotations

Annotations are optional, and any number—including none—is valid. Add them when colocated context improves the review by:

- explaining intent or constraints;
- surfacing meaningful risks or trade-offs;
- highlighting a non-obvious decision; or
- asking a focused question.

Choose the narrowest useful scope: the review, a file, a line, or a line range. Line and range annotations can select the `old` or `new` side. Tuicr validates file and line anchors.

Only one review can be active. Calling the tool again with the same normalized target reuses it, skips accepted annotations, retries failed annotations, and treats changed text as a new annotation. A different target is rejected until the current review ends. Individual annotation failures are returned without closing the review.

## Lifecycle and recovery

Each review receives a private `XDG_DATA_HOME`. The extension retains the exact Herdr tab, pane, and Tuicr session it created, and launches Tuicr with `--stdout` and `--no-update-check`. It does not focus the new tab.

When Tuicr exits, the extension reads the exact session's complete comments. Retained accepted comment IDs separate seeded Pi annotations from Maintainer comments. It persists feedback before best-effort cleanup, closes only its exact tab, removes only its private temporary data, and sends one visible follow-up that starts a Pi turn. If exact comments remain unreadable after bounded retries, it reports failure without removing the private session so it remains available for inspection or later recovery.

A compact ready-review record allows an extension reload or later resume of the same owning Pi session to continue monitoring. A compact finished record and stable delivery identity allow feedback absent from the current branch to be replayed after resume. Live conversation-tree navigation is not blocked: the in-process review follows navigation and is persisted into the newly visible branch. New-session, resume, and fork rebinds do not migrate ownership to their destination session; recovery requires resuming the original owning Pi session. Shutdown and reload detach monitoring without closing the review so it can be restored later.

## Accepted limitations

- Initial launch is not recoverable if Pi terminates before readiness is recorded.
- Recovery is not guaranteed after reboot, temporary-directory deletion, or when the owning Pi session is never resumed.
- A narrow crash race between queueing feedback and Pi persisting that exact message can duplicate the follow-up.
- Cleanup is best effort. Failures are reported with the exact owned resources and may leave the tab or private temporary directory behind.
