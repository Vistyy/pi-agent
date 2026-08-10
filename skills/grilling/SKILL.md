---
name: grilling
description: Use when the user wants to stress-test a plan or design before implementation, or uses a `grill` trigger phrase.
---

# Grilling

Use progressive elaboration to stress-test the choices and assumptions that could materially change the requested outcome, observable behavior, interfaces, safety, or implementation authority.
Inspect available evidence before asking the user.

## Maintain the current understanding

Distinguish established facts, settled decisions, and material unresolved choices while reasoning about the plan.
Treat facts and settled decisions as constraints.
Do not reopen a settled decision without new evidence or an explicit request.
No decision ledger or standard representation is required.

## Run decision rounds

1. Select one primary unresolved decision.
2. Inspect the code and documentation that could resolve it without user input.
3. Give the strongest supported recommendation and its reason when one is available.
4. Ask one focused decision round and wait for the user's response.
5. Incorporate the response before selecting the next round.

A decision round may contain several questions only when they concern the same decision and the answer to one would not change whether or how the others should be asked.
Use one question when later questions depend on its answer.
Do not batch unrelated questions or ask downstream questions merely to make the plan appear complete.
Do not invent unresolved choices to prolong planning.

Use an open narrowing question only when proportionate inspection supports no recommendation.
State the evidence limit and do not repeat the inspection without new evidence.

## Finish planning

A request to continue or proceed advances the work.
Do not use it as a reason to restart planning or demand approval of wording and implementation details that the user did not ask to approve.
Planning is sufficient when no material unresolved choice prevents safe implementation of the agreed outcome and remaining choices are local and reversible.

If the user asks to stop planning, report only the material settled decisions and unresolved blockers.
Otherwise, summarize only the decisions created or changed during the discussion unless the user asks for a complete plan.
