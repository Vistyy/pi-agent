---
name: papercut-review
description: "[M] Review pending agent papercuts and decide which observations need follow-up."
disable-model-invocation: true
---

# Papercut Review

Review one deterministic batch of pending papercuts.
Identify the highest-leverage improvements, then obtain the user's disposition for every entry in the batch.
Do not implement fixes, create Tasks or issues, or modify repositories during this workflow.

Use the bundled [papercut helper](scripts/papercuts.mjs) for all papercut queries and mutations.
Do not read or edit `inbox.jsonl` or `archive.jsonl` directly.
Resolve the script path relative to this skill directory before execution.

## 1. Prepare the review packet

Run:

```bash
node <resolved-skill-directory>/scripts/papercuts.mjs prepare
```

Treat the returned entries as the complete batch for this review.
Do not load additional papercuts or infer entries that are not in the packet.

If `returned` is zero, tell the user that no papercuts are pending and stop.
If `hasMore` is true, state that the review covers the oldest returned entries and that more entries remain pending.

This step is complete when one non-empty, bounded review packet is available and its coverage is explicit.

## 2. Analyze the complete batch

Group entries that appear to share an underlying cause.
Do not group entries only because they belong to the same project or use similar words.
Keep an entry separate when the evidence does not support a shared cause.

For each group:

- List every source entry ID.
- Describe the observed friction.
- State the likely underlying cause and the evidence for it.
- State material uncertainty.
- Recommend `follow-up` or `dismissed`.

Rank groups by the likely leverage of addressing their underlying cause.
Consider recurrence, affected projects, wasted effort, breadth of the likely improvement, and confidence in the cause.
Do not use a numerical score.

Select at most three groups as top candidates.
Include every remaining group in the lower-priority table so every packet entry receives a proposed disposition.

This step is complete when every packet entry appears in exactly one group and every group has a traceable recommendation.

## 3. Present the review

Return these sections:

### Review scope

State `pendingTotal`, `returned`, and `hasMore`.

### Top candidates

For each top candidate, state:

- Source IDs
- Observed friction
- Likely cause
- Why it has leverage
- Suggested intervention
- Material uncertainty
- Recommended disposition

### Other groups

Use this table:

| Group | Source IDs | Reason | Recommended disposition |
| --- | --- | --- | --- |

Omit this section when no other groups exist.

### Decision requested

Ask the user to accept or change the recommended disposition for every group.
Do not run the disposition operation before the user gives an explicit decision.

This step is complete when the user can decide every group without reading the raw papercut files.

## 4. Record the user's decision

After the user explicitly decides, run the helper once for each disposition that has entries:

```bash
node <resolved-skill-directory>/scripts/papercuts.mjs resolve \
  --disposition follow-up \
  --id <id> \
  --id <id>
```

```bash
node <resolved-skill-directory>/scripts/papercuts.mjs resolve \
  --disposition dismissed \
  --id <id> \
  --id <id>
```

Use `--note <text>` only when the user's decision includes rationale that later reviewers need.
Do not invent disposition rationale.

Report the number of resolved and no-op entries for each disposition.
Leave entries pending when the user does not decide their disposition.

This step is complete when every explicitly decided entry has the selected disposition and every undecided entry remains pending.
