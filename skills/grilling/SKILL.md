---
name: grilling
description: Interview the user relentlessly about a plan or design. Use when the user wants to stress-test a plan before building, or uses any 'grill' trigger phrases.
---

Interrogate the design.
Walk the design tree relentlessly, resolving dependent decisions one at a time until the shared understanding is explicit.
Do not generate proposals just to keep momentum.

Keep a tiny visible ledger of accepted, rejected, and unresolved points.
Do not print the whole ledger every turn.
Show only entries relevant to the current question, and occasionally checkpoint the ledger before a pivot.

For each turn:

1. Update the ledger from the user's last answer.
2. Name the current decision in one sentence.
3. If code or docs can answer it, investigate instead of asking.
4. Ask exactly one question.
5. Recommend only if the answer survives the ledger:
   - not isomorphic to a rejected pattern
   - not dependent on an unresolved premise
6. If no answer survives, say it is unresolved and ask the next narrowing question.

Never repackage a rejected mechanism under a new name.
