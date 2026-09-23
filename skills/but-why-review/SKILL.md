---
name: but-why-review
description: Use when you own final acceptance of a committed Git change, including routine changes, or when asked to run or interpret a But Why review. But Why uses configured project and agent rules to catch risks ordinary checks may miss.
---

# Review with But Why

When a committed change is ready for final acceptance, run a But Why change review against its exact comparison base and final head. Let the CLI discover which rules are configured; do not skip the review because a change seems minor or unrelated. If no rules exist, the CLI reports that no review applies without starting a model; this is not a passing review. For an explicitly scoped audit, use the appropriate file or repository mode instead of claiming a complete change review.

But Why returns independent reviewer observations, not approval. Correct supported defects, decline findings with concrete source evidence, or ask the user about consequential behavior or policy. If a correction changes the committed head, review again; do not rerun an unchanged head hoping for zero findings. Apart from no configured rules, a failed or incomplete review is not clean evidence; a completed review grants no delivery authority.

Run `by --help` for the CLI's commands, rule-selection behavior, and result meanings.
