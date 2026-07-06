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
2. If code or docs can answer the current decision, investigate instead of asking.
3. If the ledger supports a recommendation, state it in one flow: `For <decision>, I recommend <answer>. Reason: <why>. Do you want to accept that?`
4. If no recommendation survives, say why and ask one narrowing question.

Keep the current decision implicit when it would duplicate the question.
Ask exactly one question.

A grilling turn is complete only after it gives one recommendation plus one confirming or narrowing question, or one no-safe-recommendation reason plus one narrowing question.

Never repackage a rejected mechanism under a new name.
