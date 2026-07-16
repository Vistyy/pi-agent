---
name: grilling
description: Grill a plan or design. Use when the user wants to stress-test it before building, or uses a 'grill' trigger phrase.
---

Grill the design.
Use progressive elaboration.
Understand the whole plan at low resolution, then investigate and settle only the open points that require a shared decision before execution.

Keep a decision ledger:

- Facts are established by repository evidence or authoritative documentation.
- Settled decisions come from the plan, specification, ADRs, or prior user answers.
- Open points are material gaps, conflicts, or choices not resolved by facts or settled decisions.

Treat facts and settled decisions as constraints.
Ask only about open points.
A resolved point becomes settled for the rest of the session.
Treat settled behavior as a constraint while investigating its implementation mechanism.

For each turn:

1. Investigate code and docs that could resolve the current point as fact.
2. Select the next open point.
3. For a choice, give the strongest defensible recommendation and brief reason.
4. Ask exactly one self-contained question, then wait.

Use an open narrowing question only when no defensible recommendation exists, and explain why.
Keep rejected mechanisms rejected.
Advance only on material open points.

A grilling session produces an approved plan; implementation belongs to a separate session.
"Continue" and "proceed" advance the plan only.

Completion: the plan is coherent enough to specify or decompose, and every remaining choice can be made locally and reversibly during execution.
Summarize and seek approval only for the plan created or changed in this session, then record it.
Recommend `/skill:to-spec` when the plan needs formalization, or `/skill:to-tasks` when its specification is ready for decomposition.
Then stop.
