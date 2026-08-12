---
name: grill-with-docs
description: "[M] Stress-test a plan and record qualifying decisions as ADRs and resolved terms in the applicable CONTEXT.md."
disable-model-invocation: true
---

Stress-test the plan until its consequential assumptions and trade-offs are explicit.
Keep planned domain terms, architectural decisions, and implementation choices in the plan or applicable Task until the functionality is implemented.
Plan approval does not make those terms or decisions part of the current system.

After implementation, record a resolved domain term in the applicable `CONTEXT.md` only when it describes the implemented domain model and the user has authorized that domain-model edit.
Apply ADR qualification and lifecycle rules only to architectural decisions implemented by the current system.
Record only implemented decisions that pass the ADR gate and whose durable recording is authorized.

If the user stops planning, report the plan's current approval status, unresolved points, and plan-only proposed definitions.
Stopping preserves the current approval status unless the user explicitly abandons the plan or withdraws approval.
The planning session is complete when the user approves or stops the plan and its status, unresolved points, and plan-only proposals are explicit.
Implemented documentation work is complete when each authorized current-system record is in the smallest applicable artifact.
