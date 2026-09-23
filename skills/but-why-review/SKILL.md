---
name: but-why-review
description: Use when you own final acceptance of a committed Git change, including routine changes, to check for But Why project or agent rules and review the exact change when present. Also use when asked to run or interpret a But Why review. Skip rule authoring and uncommitted-only work.
---

# Review with But Why

But Why runs independent Pi reviewers over committed Git revisions. Its prose findings are evidence, not a pass/fail verdict. This skill is for using existing rules; `by --rule-guide` explains how to write and calibrate them.

## At final acceptance

When you own handback of a committed repository change, check for project `.but-why/rules/*.md` in the comparison base and agent-wide `<Pi agent directory>/but-why/rules/*.md` (normally `~/.pi/agent/but-why/rules/`). But Why loads project rules from the base commit for change reviews, not from the proposed head. If neither location has rules, there is no But Why review to run. Do not decide to skip configured rules because the change seems minor or unrelated. In Workgraph, the Coordinator owns final acceptance after integrating a Candidate; an Implementation Worker runs this review only when its assignment requests it.

From the target repository, review the final committed change once:

```sh
by review change --base <full-comparison-base-sha> --head <full-final-head-sha>
```

Use the exact comparison base and final revision, not an uncommitted diff or an intermediate commit. The model comes from But Why's agent-level config or an explicitly chosen `--model`; if neither is configured, do not guess one. A rule introduced only in the proposed head cannot review that change in `change` mode; use the authoring guide to calibrate it separately and do not claim that it ran against the change.

For an explicitly requested narrower audit, `by review files --at <full-sha> <paths...>` reviews named committed files; `by review repository --at <full-sha>` audits the committed repository. Neither substitutes for a change review when one is owed.

## Use the result

Inspect the CLI's JSON: confirm its exact commits, the expected rule identities and digests, and each reviewer's unedited prose or failure. Exit zero with `incomplete: false` means the reviewers finished and cleanup succeeded, **not** that they found no defects. An unavailable executable, missing model, failed reviewer, or incomplete result is not a clean review; report the blocker and preserve any checkout But Why could not prove safe to remove.

Correct supported defects within your authority, give a concrete source-based reason to decline a finding, or ask the user when its disposition changes accepted behavior or scope. If a correction changes the committed head, review that new revision. Do not rerun an unchanged revision just to get zero findings. Review completion does not grant permission to integrate or publish.
