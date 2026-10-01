---
name: change-delivery
description: >-
  Use when implementing and delivering repository changes across investigation,
  conditional design, verified implementation, diff assessment, authorized PR
  creation, and requested follow-up. Covers bug fixes, refactors, performance,
  tests, configuration, infrastructure, and docs as well as features. Also use
  to open a PR for completed work. Not for read-only investigation, disposable
  prototypes, or standalone follow-up of an already open PR.
---

# Deliver a change

Coordinate the requested work through its agreed endpoint. Use relevant methods and principles without requiring every resource or a separate plan document. Enter at the first unfinished stage; do not repeat completed work without evidence that it needs reassessment.

## 1. Establish the goal and endpoint

Determine whether the request ends at verified local changes, an opened PR, or a merge-ready PR. Use the request and agreed workflow; ask only when the goal or publication scope is unresolved. A request to change code does not by itself authorize publishing, starting a watch, merging, enabling auto-merge, or production deployment.

Inspect the actual repository instructions, local changes, branch, base, existing PRs and dependencies, and verification guidance. Preserve unrelated work. Record the intended effect, affected contracts, checks, and endpoint in the existing worklog. Identify any checks that require a PR or development deployment before they can run.

## 2. Ground and shape the change

Use the task type to choose the method. For unclear runtime flow, use How. For bugs, use Root Causes and establish a reproducer. For changes to data shapes, contracts, or boundaries, use Architect before implementation. Routine changes do not require a design exercise. Use the available project verification skill or harness for the affected entry points.

Identify the current behavior, proposed behavior, important invariants, and smallest useful verified units. Keep open product decisions distinct from facts that can be inspected. Explain consequential choices without inventing alternatives or independent reviewers.

## 3. Implement verified units

Establish the relevant baseline, make one coherent change, and check the affected observable contract before proceeding. Use Sequence verifiable units for the ordering. Diagnose failed checks rather than adding speculative fixes or weakening expectations to pass. Update the worklog when evidence changes the direction.

## 4. Assess and verify

Review the full intended diff against the goal, actual callers, and affected contracts. Use Deslop before an authorized code commit. Run the repository checks and exercise affected user or service workflows through supported entry points and real integrations. Compilation or a narrow test alone does not prove the full behavior.

Record the actual results, tested revision and context, and any blocked coverage. Reassess relevant evidence after changes. Do not describe remote verification as passed before it runs. If the endpoint is local-only, report the verified changes and remaining limits here.

## 5. Publish when authorized

Before writing the body, read [Write a PR description](references/pr-description.md). Use Technical Writing for the title and prose. Follow the repository's template, title, commit, and draft conventions rather than imposing a universal format.

Confirm the actual repository, owning branch, intended base, and exact published diff. Commit and push only within the agreed workflow. Keep unrelated changes out. Do not reset work, rewrite history, or publish a whole stack as an incidental shortcut.

Use `gh-axi` for supported GitHub operations and inspect current help. Use raw `gh` when the wrapper lacks an operation or necessary guard. Pass the PR body through a file or structured payload, not shell interpolation. Do not use a publication command that also enables auto-merge.

When PR-triggered verification remains, choose draft or ready status according to repository policy and the authorized request. Do not present pending evidence as completed verification. Read back the created PR, including its URL, body, base, head, and draft status, rather than treating command success as proof. An opening-only request stops here.

## 6. Complete the requested follow-up

If the endpoint includes remote verification or merge-readiness, use PR follow-up for the existing PR's requested reviews, checks, development prerequisites, and watch. Otherwise report pending remote work without starting an unsolicited watcher. Update the description when verification results or the published change alter its claims.

Stop at the agreed endpoint or a reported blocker. Report what changed, important choices, actual verification and limits, the PR when created, and any required human action. Merging and enabling auto-merge are separate tasks, not the final step of this playbook.
