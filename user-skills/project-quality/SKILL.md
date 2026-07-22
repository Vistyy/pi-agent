---
name: project-quality
description: "[M] Audit, establish, or update a repository quality baseline."
disable-model-invocation: true
---

# Project Quality

## Request

$ARGUMENTS

Inspect before editing.
For an assessment request, report without editing.
For authorized changes, implement settled changes.
Ask before editing when authorization remains unclear.

## Quality interface

Establish the quality interface that the project chooses to maintain.
Put reliable blocking checks required for routine completion in `just quality`.
When the project explicitly selects a slower validation gate, keep its command, scope, and invocation lifecycle project-defined.
Do not invent a slower gate or instruct ordinary agents to run one without an approved project policy.
Put useful advisory maintenance reports in `just health` when the project needs them.
Keep project-specific thresholds, runtime expectations, architecture contracts, naming vocabulary, and tool scope in the repository.
Prefer native tool behavior and the smallest configuration that provides the selected signals.

Provide `just init`, `just quality`, and the applicable format, lint, typecheck, test, coverage, documentation, build, and diagnostic recipes.
Provide an additional blocking recipe only when the project selects a separate validation lifecycle.
Keep tool commands inside Just recipes.
`just` must list the supported recipes.
Each blocking gate may write ignored artifacts, but it must leave tracked files unchanged.

Tests must exercise public module interfaces.
Applicable external contracts must have integration or end-to-end coverage.

## 1. Inspect the repository

Read every applicable repository instruction.
Record:

- Runtimes, languages, frameworks, module systems, package managers, and version mechanisms.
- Production, test, generated, build, fixture, coverage, script, documentation, and local-state paths.
- Existing quality tools, configuration, commands, package hooks, documentation callers, and automation callers.
- Existing architecture, vocabulary, naming, and repository-navigation contracts.
- Which checks block routine completion, which checks block another approved lifecycle, and which reports are advisory.

Classify each requested quality outcome as satisfied, missing, conflicting, or undecided.
Record repository evidence for every classification.
Read each applicable technology reference:

- For TypeScript or JavaScript, read [references/typescript.md](references/typescript.md).

This step is complete when each requested outcome and discovered path has an evidence-backed classification.

## 2. Resolve the quality policy

Preserve each existing tool that satisfies the selected quality policy.
Use approved architecture, vocabulary, and naming contracts.
Before adding a contract or foundational tool, ask the user for approval.
Continue only after the user explicitly approves.
Report missing semantic decisions instead of inventing them.
Use `library-orientation` before selecting a foundational tool not covered by existing project choices or a technology reference.

Classify each selected check as routine blocking, lifecycle blocking, or advisory.
A blocking check must fail reliably for the defect it claims to prevent.
A lifecycle-blocking check must have an approved invocation owner and lifecycle.
An advisory report or runtime warning must not determine a blocking command's exit status.

This step is complete when every requested check has an approved owner, scope, enforcement mode, and invocation lifecycle.

## 3. Apply or report

For an assessment request, report the required changes, decisions, commands, and verification gaps without editing.

For authorized changes:

1. Establish the applicable Just recipes.
2. Configure the selected quality tools.
3. Align entrypoints, maintained paths, generated paths, and local-state paths.
4. Put routine blocking checks in `just quality`.
5. Put lifecycle-blocking checks in the approved project-defined command.
6. Put selected advisory reports in `just health`.
7. Update project documentation to describe the supported commands, invocation lifecycles, and current policy.

This step is complete when no selected quality outcome remains missing or conflicting.

## 4. Verify

For authorized changes:

1. Create or use a disposable checkout at the reviewed revision.
2. Run `just init` in the pinned environment.
3. Run `just quality`.
4. Run each selected lifecycle-blocking command required for quality-interface verification.
5. Run each selected advisory recipe and record its findings.
6. Determine completion from the applicable blocking command results, not from advisory findings or runtime warnings.
7. Run `git status --short` and confirm that each gate leaves tracked files unchanged.

For an assessment request, run every available read-only check that supports the outcome classification.
Resolve each failure or report its exact unresolved cause.
Preserve unrelated working-tree changes.

The final report must include the outcome classification, files changed or proposed, commands and results, unresolved decisions, and remaining failures.
Authorized changes are complete only when `just quality`, each selected lifecycle-blocking command, and selected advisory reports match the documented project policy in the pinned environment.
