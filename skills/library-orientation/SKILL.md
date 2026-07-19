---
name: library-orientation
description: Library orientation for foundational dependencies. Use before a code or architecture change when a foundational library may already address the concern, and when a version change or live evidence challenges the existing map.
---

# Library orientation

Use persistent orientation as a map, not proof of absence.
The orienter decides whether the current concern is covered, needs targeted expansion, or invalidates cached evidence.

## 1. Frame the concern

Name the design concern and the few dependencies that could own it.
Include foundational libraries whose relevance is plausible even when the repository has no established pattern for the concern.

Completion criterion: the request states the concern and every foundational dependency plausibly capable of addressing it.

## 2. Delegate the coverage check

Invoke the `library-orienter` named subagent once with:

- the absolute repository path;
- the current design concern;
- every selected library;
- material repository context or conflicting evidence.

The orienter consumes the persistent cache and checks whether it covers the concern.
A fresh covering entry is returned unchanged across conversations; research and cache writes occur only for an explicit refresh trigger.
Preserve explicit user constraints and requested output format.

Completion criterion: every selected library is classified as covered, expanded, refreshed, or materially irrelevant, with source-backed application guidance and uncertainties visible.

## 3. Use the orientation

Treat the report as evidence rather than policy.
Use its application guidance to choose the capability and preserve its intended composition, lifecycle, and runtime boundaries.
Verify exact APIs against the installed version when implementation reaches them.
Surface material conflicts between official guidance and repository usage.
Record deliberate project decisions in the repository's accepted decision record.

Completion criterion: the current decision accounts for every relevant capability, conflict, and uncertainty reported by the orienter.
