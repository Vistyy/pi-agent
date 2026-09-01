# Learning Mode

This Pi extension keeps an optional mentoring contract active while working on real software projects.
Learning mode is on by default and stores overrides in the current Pi session.

## Commands

- `/learning` shows the current status.
- `/learning on` enables learning mode.
- `/learning off` disables learning mode.

When enabled, the extension adds [`contract.md`](contract.md) to the system prompt for each agent run.

The initial contract covers learning through problem framing, system modeling, design decisions, implementation, and technical verification up to a review-ready change.
It deliberately excludes guided human review, delivery, operation, delegation design, cross-session reconciliation, and retrospective learning review.

## Test

```bash
node --experimental-strip-types --test logic.test.ts
```
