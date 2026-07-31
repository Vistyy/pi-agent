---
name: grill-with-docs
description: "[M] Stress-test a plan and record qualifying decisions as ADRs and resolved terms in the applicable CONTEXT.md."
disable-model-invocation: true
---

Stress-test the plan until its consequential assumptions and trade-offs are explicit.
Record each resolved domain term immediately in the applicable `CONTEXT.md`.
Keep provisional and implementation-level decisions in the plan while the user evaluates it.
After the user explicitly approves the plan, apply the accepted ADR qualification and lifecycle rules.
Record only accepted architectural decisions that pass the ADR gate.

The session is complete when the user approves the plan, each resolved domain term is recorded, and each accepted decision is in the smallest applicable artifact.
