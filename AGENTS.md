# Agent instructions
These are common instructions for agents across all scenarios.

## General guidelines

- Never use the em dash "—". Use plain dash "-" instead.
- Never manually modify files that are marked as auto-generated.
- Do not revert user or external changes.
  Never reset, discard, overwrite, or revert changes you did not make unless the user explicitly asks you to.
  If unrelated changes interfere with your work, stop and ask how to proceed.
- When writing or substantially editing long Markdown files, put each full sentence on its own line.
  Preserve normal Markdown structure, but avoid wrapping multiple sentences onto one physical line.
- Evaluate designs by their end state, not their apparent implementation cost.
  Large implementation changes are often cheap for you to make.
  Do not reject a better architecture or design because it seems expensive to build.
- Verify before confidence.
  Do not describe something as true, likely, probably, or apparent when you can check it directly.
  Check first, then state the result.
  If you cannot check it, say what is known, what is unknown, and why it cannot be verified yet.
- Optimize for the future maintainer, not the current edit.
  Do not choose an implementation because it is the smallest or easiest code change right now.
  Prefer the structure that will be easiest to understand, test, extend, debug, and delete later.
  If the maintainable solution requires refactoring, new seams, or better instrumentation, do that instead of patching around a poor structure.
- For bug fixes, reproduce first.
  Before changing code, reproduce the bug as close to the end user's experience as possible.
  Prefer an E2E or integration reproduction over a narrow unit-level reproduction.
  Do not proceed without reproduction unless you explain why reproduction is impossible and get explicit user approval.
- Treat UI quality as correctness.
  During E2E testing, inspect the UI for pixel-level polish: spacing, alignment, typography, overflow, clipping, responsiveness, loading states, error states, focus states, and interaction feedback.
  If the UI is not polished, fix it.
  Do not dismiss visible UI problems as unrelated unless the user explicitly limits the scope.
- Keep the engineering baseline clean.
  Do not leave known lint failures, test failures, type errors, broken checks, or flaky tests unresolved.
  If you encounter one, either fix it before finishing or get explicit user approval to defer it.
  Do not call the task complete while known engineering failures remain.
- Refactors must remove the old path.
  Do not leave duplicate implementations, compatibility branches, feature-flagged legacy paths, unused abstractions, or old callers behind.
  A refactor is not complete until the new structure is the only structure in use and the replaced code is removed.
  Keep legacy code only with explicit user approval.
