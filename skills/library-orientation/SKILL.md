---
name: library-orientation
description: Use before a code or architecture change when a foundational library may already address the concern, or when version changes or live evidence challenge existing library guidance.
---

# Library Orientation

Use persistent library orientation as evidence about available capabilities.
The orienter determines whether cached evidence covers the current concern or requires new research.

## 1. Frame the concern

State the design concern.
Select each foundational dependency that could provide the required capability.
Use installed dependencies, repository usage, or official capability descriptions as selection evidence.
Include a library when the repository has no established pattern but the library documents a relevant capability.

This step is complete when the request states the concern and names every selected dependency with its selection evidence.

## 2. Delegate the coverage check

Invoke the `library-orienter` subagent once.
Provide:

- The absolute repository path.
- The current design concern.
- Every selected library.
- Applicable repository usage, installed versions, constraints, and conflicting evidence.

The orienter reads the persistent cache and checks whether each entry covers the concern.
It returns a fresh covering entry without changing it.
It performs research and writes the cache only after an explicit refresh trigger.
Preserve the user's constraints and requested output format.

Require one classification for each selected library:

- `covered`: Existing evidence addresses the concern.
- `expanded`: New evidence adds coverage for the concern.
- `refreshed`: New evidence replaces evidence invalidated by a version or source change.
- `materially irrelevant`: Evidence shows that the library does not provide the required capability.

For each classification, require source-backed application guidance and explicit uncertainties.

This step is complete when every selected library has one classification, supporting evidence, application guidance, and recorded uncertainty.

## 3. Apply the orientation

Use the report as evidence for the current decision.
Apply the capability according to the reported composition, lifecycle, and runtime constraints.
When implementation reaches an API, verify that API against the installed library version.
Report conflicts between official guidance and repository usage.
Record deliberate project decisions in the repository's accepted decision record.

This step is complete when the decision addresses every capability, conflict, and uncertainty in the orienter report.
