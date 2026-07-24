# Agent instructions

## User and communication

- The user's GitHub username is `Vistyy`.
- The user uses speech-to-text transcription.
  Ask for clarification when a phrase is nonsensical or conflicts with its context.
- Use the plain hyphen `-` instead of an em dash.
- When writing or substantially editing long Markdown files, put each complete sentence on its own physical line.

## Delegation

- As the user-facing parent, delegate bounded context gathering, verification, review, and experiments to configured workers.
- Keep problem framing, hypotheses, decisions, persistent edits, final validation, and user communication in the parent.
- Give each worker a self-contained evidence-gathering task or hypothesis to test.
  Before delegating, select the loaded skills that match the task.
  Pass those skills when the delegation mechanism supports a `skills` input.
- While a worker is active, continue only with non-overlapping parent responsibilities.
- After the worker responds, investigate only consequential evidence gaps, ambiguities, or conflicts before making the parent decision.

## Repository safety and validation

- Change the generator source and regenerate its output.
  Do not manually edit generated files.
- Preserve user and external changes.
  Do not reset, discard, overwrite, or revert changes that you did not make without explicit user approval.
  If unrelated changes block the task, stop and ask the user how to proceed.
- Use Just as the repository command interface.
  Run `just` to discover the supported recipes.
  Use those recipes for repository workflows.
- Run the repository's supported blocking gate before completion.
  Fix known test, lint, type, check, and flaky-test failures.
  Get explicit user approval before deferring a failure or changing an enforced policy.

## Design and implementation

- Before refining local details, identify the requested observable behavior, owning domain or module, integration points, and verification path.
- Resolve uncertainty that could change those boundaries before implementation.
  Leave local and reversible choices to execution.
- Choose the smallest coherent design that satisfies the current requirement end to end.
  A coherent design follows established ownership and module boundaries.
- Implement edge cases required by authoritative context or concrete repository evidence.
  Add abstractions, generality, and future flexibility only for a known current need.
- Before confirming a proposed solution for implementation, compare it with the smallest coherent solution that satisfies the requested outcome.
  Confirm additional complexity only when concrete evidence justifies it.
- Use canonical project terms for public and domain-facing names.
  Read the applicable `CONTEXT.md` before naming behavior.
  Ask the user when a required canonical term is missing or ambiguous.
  Private names may rely on their module context.
- Navigate with precise search anchors built from canonical terms and the applicable operation or role.
  Search for the precise anchor before widening the search.
- State the supported behavior, API, path, or workflow directly.
  Tests must assert observable behavior.
  Comments, documentation, and instructions must direct readers to the supported path.
  When a retired path remains a likely hazard, name it and pair it with the supported replacement.
- A refactor must remove the replaced implementation, compatibility paths, feature flags, unused abstractions, and old callers.
  Keep legacy behavior only with explicit user approval.

## Verification

- Verify checkable claims before stating them.
  When verification is unavailable, state what is known, what remains unknown, and why.
- Before fixing a bug, reproduce it as close to the user-facing seam as practical.
  Prefer an integration or E2E reproduction over a unit reproduction.
  If reproduction is impossible, explain why and get explicit user approval before changing code.
- When UI behavior is in scope, inspect spacing, alignment, typography, overflow, clipping, responsiveness, loading, errors, focus, and interaction feedback during E2E verification.
  Fix visible defects unless the user explicitly excludes them.
