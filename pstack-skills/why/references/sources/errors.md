# Error and exception history

## What this source contains

Grouped errors, individual events and stack traces, first/last-seen dates, frequency, affected releases and environments, tags and breadcrumbs, issue comments, resolution markers, and accessible recordings or profiles.

## How to search deeply

Orient to the right project and environment. Search exception classes, handled errors, symbols and file paths. Inspect complete representative events: does the stack reach the target, and do tags or breadcrumbs match the defended condition? Compare first seen, last seen, affected releases, and frequency across the introduction and deployment window. Read author comments and correlate with exact commits and neighboring changes, not only release names.

Treat automated root-cause summaries as hypothesis generators. Verify them against original events, traces, timestamps, and explicit human explanations before making a claim.

## What strong evidence looks like

A change explicitly referencing an error record, an author explaining the fix, or matching events demonstrating the specific failure. An error disappearing after a release is circumstantial support; a release can contain many changes.

## Common pitfalls

Grouping or fingerprint changes may move the same failure to another issue. A manual resolution marker does not prove the problem stopped. Upstream changes or another fix may explain disappearance. Sampling affects apparent frequency. Automated analyses can invent a coherent explanation; original events remain primary evidence. Missing historical events are not proof that an error never happened.
