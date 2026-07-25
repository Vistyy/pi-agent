---
name: grill-with-docs
description: "[M] Stress-test a plan and record qualifying decisions as ADRs and resolved terms in the applicable CONTEXT.md."
disable-model-invocation: true
---

Run a `grilling` session.
Use the `domain-modeling` skill to record each resolved domain term immediately in the applicable `CONTEXT.md`.
Record each qualifying architectural decision in an ADR under the applicable `docs/adr/` directory.

The session is complete when the plan is ready, the user explicitly approves it, and every resolved domain term and qualifying architectural decision is recorded in its applicable artifact.
