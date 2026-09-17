# Tuicr review

`tuicr_review` opens one asynchronous Tuicr review for the current Pi conversation branch in a dedicated Herdr tab. It ensures the requested target is open and the requested Coordinator-authored annotations are present, then returns as soon as the review is ready.

## Prerequisites

- Herdr available on `PATH`
- Tuicr 0.26.0 or newer available on `PATH`
- Pi running inside a Herdr-managed pane (the target workspace is read from the live current pane)
- A Git working tree at the requested `cwd` (or Pi's current working directory)

Pass `target.kind: "workingTree"` for uncommitted changes, or `target.kind: "revisions"` with a `revset` and optional `includeWorkingTree`. Optional annotations may target the whole review, a file, a line, or a line range. Their `type` is optional; the extension does not impose a taxonomy.

The active review is reused only for the same target; exact accepted annotations are deduplicated and failed or revised annotations may be retried. Only one review can be active per conversation branch.

The extension owns only the exact Herdr tab/pane, Tuicr session, and temporary data directory it creates. Each review gets a private `XDG_DATA_HOME`; the Herdr tab and all `tuicr review` CLI operations use it, so unrelated concurrent Tuicr sessions cannot be discovered or adopted. `XDG_CONFIG_HOME` is unchanged. It launches Tuicr with `--no-update-check` and does not provide a same-terminal or non-Herdr fallback.

Known completion (including a nonzero exit) closes the owned tab. Manual tab/pane absence is reported as cancellation. The private data directory is removed only after terminal feedback is durably recorded and tab closure or absence is known. Any ownership, cleanup, or monitoring uncertainty becomes a persistent recovery-blocked state that preserves exact identities and prevents another review until a human resolves it; malformed identity is never acted upon.

Terminal feedback, including every seeded Coordinator and Maintainer comment, is persisted before delivery. Interrupted delivery is retried after reload, while an already-appended matching delivery is not duplicated. Completion feedback distinguishes seeded and Maintainer comments; review feedback is not Human sign-off or delivery authority.
