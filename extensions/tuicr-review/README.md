# Tuicr review

`tuicr_review` opens one asynchronous Tuicr review for the current Pi conversation branch in a dedicated Herdr tab. It ensures the requested target is open and the requested Coordinator-authored annotations are present, then returns as soon as the review is ready.

## Prerequisites

- Herdr available on `PATH`
- Tuicr 0.26.0 or newer available on `PATH`
- Pi running inside a Herdr-managed pane
- A Git working tree at the requested `cwd` (or Pi's current working directory)

Pass `target.kind: "workingTree"` for uncommitted changes, or `target.kind: "revisions"` with a `revset` and optional `includeWorkingTree`. Optional annotations may target the whole review, a file, a line, or a line range. Their `type` is optional; the extension does not impose a taxonomy.

The active review is reused only for the same target; exact accepted annotations are deduplicated and failed or revised annotations may be retried. Only one review can be active per conversation branch.

The extension owns only the exact Herdr tab/pane and persisted Tuicr session it creates. It does not provide a same-terminal or non-Herdr fallback. Completion feedback distinguishes seeded Coordinator annotations from Maintainer comments; review feedback is not Human sign-off or delivery authority.
