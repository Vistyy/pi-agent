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
Use the repository's supported command interface unless the project approves a change.
Provide one reliable routine blocking gate when the project selects one.
When the project explicitly selects a slower validation gate, keep its command, scope, and invocation lifecycle project-defined.
Do not invent a slower gate or instruct ordinary agents to run one without an approved project policy.
Expose useful advisory maintenance reports through the selected command interface when the project needs them.
Keep project-specific thresholds, runtime expectations, architecture contracts, naming vocabulary, and tool scope in the repository.
Prefer native tool behavior and the smallest configuration that provides the selected signals.

When the repository provides or selects Just as its command interface:

- Provide `just quality` for a selected routine gate.
- Provide `just init` for selected initialization behavior.
- Provide recipes only for other selected outcomes that have supported commands.
- Provide an additional blocking recipe only when the project selects a separate validation lifecycle.
- Keep tool commands inside Just recipes, and ensure `just` lists the supported recipes.

Each blocking gate may write ignored artifacts, but it must leave tracked files unchanged.

## 1. Inspect the repository

Read every applicable repository instruction.
Record only facts and paths relevant to the requested outcomes and selected command interface:

- Runtimes, languages, frameworks, module systems, package managers, and version mechanisms.
- Production, test, generated, build, fixture, coverage, script, documentation, and local-state paths.
- Existing quality tools, configuration, commands, package hooks, documentation callers, and automation callers.
- Existing architecture, vocabulary, naming, and repository-navigation contracts.
- Which checks block routine completion, which checks block another approved lifecycle, and which reports are advisory.

Classify each requested quality outcome as satisfied, missing, conflicting, undecided, or not applicable.
Do not add an outcome that the request, accepted project policy, or repository evidence does not select.
Treat explicit user-provided facts as evidence within their stated scope, and distinguish them from executable behavior that remains unverified.
Record evidence for every classification.
When TypeScript or JavaScript tool selection or configuration is in scope, read [references/typescript.md](references/typescript.md).

This step is complete when each requested outcome and relevant path has an evidence-backed classification.

## 2. Resolve the quality policy

Preserve each existing tool that satisfies the selected quality policy.
Use approved architecture, vocabulary, and naming contracts.
For an assessment, report a candidate contract or foundational tool and the approval needed without selecting or adding it.
Before selecting or adding one during authorized changes, ask the user for approval and continue only after explicit approval.
Report missing semantic decisions instead of inventing them.
Research a foundational library before selecting a tool not covered by existing project choices or a technology reference.

Classify each selected check as routine blocking, lifecycle blocking, or advisory.
A blocking check must fail reliably for the defect it claims to prevent.
A lifecycle-blocking check must have an approved invocation owner and lifecycle.
An advisory report or runtime warning must not determine a blocking command's exit status.

This step is complete when every selected check has an approved owner, scope, enforcement mode, and invocation lifecycle and each undecided check names the required decision.

## 3. Apply or report

For an assessment request, report the required changes, decisions, commands, and verification gaps without editing.

For authorized changes:

1. Establish the selected command entrypoints.
2. Configure the selected quality tools.
3. Align entrypoints, maintained paths, generated paths, and local-state paths.
4. Put routine blocking checks in the selected routine gate.
5. Put lifecycle-blocking checks in the approved project-defined command.
6. Expose selected advisory reports through the selected command interface.
7. Update project documentation to describe the supported commands, invocation lifecycles, and current policy.

Assessment reporting is complete when every required change, decision, command, and verification gap is explicit.
Authorized application is complete when no selected quality outcome remains missing or conflicting.

## 4. Verify

For authorized changes:

1. Use a disposable checkout only when the supported workflow requires a clean environment or a gate may modify tracked files.
2. Run the supported initialization command when the selected verification requires it.
3. Run the selected routine blocking gate.
4. Run each selected lifecycle-blocking command required for quality-interface verification.
5. Run each selected advisory command and record its findings.
6. Determine completion from the applicable blocking command results, not from advisory findings or runtime warnings.
7. Run `git status --short` and confirm that each gate leaves tracked files unchanged.

For an assessment request, run the available read-only checks that directly support requested outcome classifications and the documented blocking gate when applicable.
Report each relevant check not run and why.
Resolve each observed failure or report its exact unresolved cause.
Preserve unrelated working-tree changes.

Return the final report under these headings in order:

### Outcome

| Requested outcome | Classification | Evidence |
| --- | --- | --- |

### Command results

| Requested outcome | Command | Scope or lifecycle | Blocking mode | Result | Findings or unresolved cause |
| --- | --- | --- | --- | --- | --- |

### Files changed or proposed

### Unresolved decisions

### Remaining failures

Use one row per independently classified outcome and independently executed command.
Group entries only when they have the same evidence, scope, mode, and result.
Use `None` under a heading when it has no entries.
An assessment is complete when every requested outcome has an evidence-backed classification, every directly relevant read-only check has a result or explicit limitation, and no file has changed.
Authorized changes are complete only when the selected routine gate, each selected lifecycle-blocking command, and selected advisory reports match the documented project policy in the pinned environment.
