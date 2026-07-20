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

## Quality contract

Every repository must provide each applicable outcome:

1. Reproducible bootstrap with pinned runtimes, tools, dependencies, and lockfiles.
2. A shared Just interface with `just quality` as the blocking local gate.
3. Strict static correctness, deterministic formatting, and linting.
4. Behavior tests that enforce approved coverage or record an explicit coverage deferral.
5. Dependency, dead-code, cycle, duplication, suppression, and health checks.
6. Automated enforcement for approved architecture and naming contracts.
7. Configuration, maintained-documentation, and CI validation through the same interface.

Tests must exercise public module interfaces.
Applicable external contracts must have integration or end-to-end coverage.

Provide each applicable standard recipe:

```text
just
just bootstrap
just config-check
just quality
just format
just format-check
just lint
just typecheck
just test [args]
just coverage [args]
just docs-check
just build
```

Add named recipes for applicable dependency, architecture, packaging, generation, database, browser-test, audit, and release operations.
`just` must list the supported recipes.
`just quality` must compose every blocking check.
Tool commands must remain inside Just recipes.
The quality gate may write ignored artifacts, but it must leave tracked files unchanged.

## 1. Inspect the repository

Read every applicable repository instruction.
Record:

- Runtimes, languages, frameworks, module systems, package managers, and version mechanisms.
- Production, test, generated, build, fixture, coverage, script, documentation, and local-state paths.
- The included, excluded, generated, or local-state treatment for every discovered path.
- Existing quality tools, configuration, commands, package hooks, documentation callers, and CI callers.
- Existing architecture, vocabulary, naming, and repository-navigation contracts.

Classify each applicable quality outcome as satisfied, missing, conflicting, or undecided.
Record repository evidence for every classification.
Read each applicable technology reference:

- For TypeScript or JavaScript, read [references/typescript.md](references/typescript.md).

This step is complete when every applicable outcome, technology, and discovered path has an evidence-backed classification.

## 2. Resolve prerequisites

Preserve each existing tool that satisfies the quality contract.
Use approved architecture, vocabulary, and naming contracts.
Before adding architecture or naming enforcement, obtain user approval for each new contract.
Report missing semantic decisions instead of inventing them.
Use `library-orientation` before selecting a foundational tool not covered by existing project choices or a technology reference.
Obtain user approval before establishing a new foundational stack.

This step is complete when every requested check has a selected implementation or an explicit unresolved decision.

## 3. Apply or report

For an assessment request, report the required changes, decisions, commands, and verification gaps without editing.

For authorized changes:

1. Establish the applicable Just recipes.
2. Configure the selected quality tools.
3. Align entrypoints, paths, and exclusions.
4. Make package hooks, documentation, agent instructions, and CI invoke Just.
5. Preserve each approved exception with an exact scope and reason.
6. Add repository naming-search instructions only when an approved naming contract exists.

This step is complete when no settled quality outcome remains missing or conflicting.

## 4. Verify

For authorized changes:

1. Create or use a disposable checkout at the reviewed revision.
2. Run `just bootstrap` in the pinned environment.
3. Run `just quality`.
4. Run `git status --short` and confirm that the gate leaves tracked files unchanged.

For an assessment request, run every available read-only check that supports the outcome classification.
Resolve each failure or report its exact unresolved cause.
Do not alter unrelated working-tree changes.

The final report must include the outcome classification, files changed or proposed, commands and results, unresolved semantic decisions, and remaining failures.
Authorized changes are complete only when bootstrap and quality pass from a disposable checkout.
