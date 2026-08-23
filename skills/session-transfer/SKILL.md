---
name: session-transfer
description: Use when the user asks to continue work in a separate Pi session, or when the request contains an independent outcome with a substantially separate working context that may warrant proposing a separate Pi session.
---

# Session Transfer

A Session transfer gives an independent outcome or the current outcome to a new Pi session with its own user dialogue.
It is not temporary helper delegation and does not use `start_agents`.

## 1. Decide whether to propose a transfer

Propose a Session transfer only when another session can own an explicit outcome and its working context is substantially separate from the current session.
Do not propose a transfer only because work is large, context-heavy, difficult, or likely to take many steps.
Do not transfer a supporting evidence operation that belongs in `start_agents`.
Do not launch a transfer without user approval unless the user already requested it.

This step is complete when the work remains in the current session or the user has approved one explicit transferred outcome.

## 2. Execute the transfer

When a transfer is approved or requested, read [Session transfer](references/session-transfer.md) and follow it completely.

This workflow is complete when the work remains in the current session or the launcher has verified the approved separate Pi session.
