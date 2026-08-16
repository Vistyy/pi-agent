---
name: grilling
description: Use when the user wants to stress-test a plan or design before implementation, or uses a `grill` trigger phrase.
---

# Grilling

Use progressive elaboration to stress-test the choices and assumptions that could materially change the requested outcome, observable behavior, interfaces, safety, or implementation authority.
Inspect available evidence before asking the user.

## Maintain the current understanding

Distinguish the required outcome, established facts, settled decisions, candidate mechanisms, and material unresolved choices while reasoning about the plan.
Treat facts and settled decisions as constraints.
Treat candidate mechanisms as provisional until the applicable authority accepts them.
Do not reopen a settled decision without new evidence or an explicit request.
No decision ledger or standard representation is required.

Before each decision round, reconcile the current understanding and remove candidate mechanisms that no established fact, current requirement, or current constraint requires.
Do not continue planning when only local and reversible implementation choices remain.

## Run decision rounds

1. Select one material unresolved decision area.
2. Inspect the code and documentation that could resolve it without user input.
3. Give the strongest supported recommendation and its reason when one is available.
4. Ask one focused decision round and wait for the user's response.
5. Incorporate the response and remove alternatives it rules out before selecting the next round.

A decision round may contain several questions when their answers together resolve or materially narrow the same decision area.
Batch questions only when the answer to one would not change whether or how the others should be asked.
Use one question when later questions depend on its answer.
Do not batch unrelated questions, ask the user to decide local and reversible details, or ask downstream questions merely to make the plan appear complete.
Do not invent unresolved choices to prolong planning.

Use an open narrowing question only when proportionate inspection supports no recommendation.
State the evidence limit and do not repeat the inspection without new evidence.

## Finish planning

A request to continue or proceed advances the work.
Do not use it as a reason to restart planning or demand approval of wording and implementation details that the user did not ask to approve.
Planning is sufficient when no material unresolved choice prevents safe implementation of the agreed outcome and remaining choices are local and reversible.

If the user asks to stop planning, report only the material settled decisions and unresolved blockers.
Otherwise, lead with whether planning is sufficient and what, if anything, the user must decide next.
Then summarize only the decisions created or changed during the discussion unless the user asks for a complete plan.
