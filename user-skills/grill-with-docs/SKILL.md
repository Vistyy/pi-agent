---
name: grill-with-docs
description: "[M] Stress-test a plan and record qualifying decisions as ADRs and resolved terms in the applicable CONTEXT.md."
disable-model-invocation: true
---

Stress-test the plan until its consequential assumptions and trade-offs are explicit.
Record a resolved domain term in the applicable `CONTEXT.md` only when the user has authorized that domain-model edit.
Otherwise, keep the proposed definition in the plan and state the authorization needed to record it.
Keep provisional and implementation-level decisions in the plan while the user evaluates it.
After the user explicitly approves the plan, apply the accepted ADR qualification and lifecycle rules.
Record only accepted architectural decisions that pass the ADR gate and whose durable recording is authorized.

If the user stops planning, report the plan's current approval status, unresolved points, and unrecorded proposed definitions.
Stopping preserves the current approval status unless the user explicitly abandons the plan or withdraws approval.
The session is complete when the user approves the plan, each authorized record is in the smallest applicable artifact, and each unrecorded proposal and its needed authorization remain explicit, or when the user stops and the reported state is explicit.
