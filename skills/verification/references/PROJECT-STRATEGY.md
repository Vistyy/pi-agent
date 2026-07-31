# Manage Project Verification Strategy

## Initialize the strategy

When `VERIFICATION.md` is absent, inspect repository instructions, supported gates, test configuration, verification tools, representative checks, and accepted decisions.
Identify recurring evidence patterns, important uncovered risks, expensive mechanisms, and known instability.
Do not infer accepted policy only from historical tests.

Research an unfamiliar mechanism when it could change the project strategy.
Obtain user approval before running a consequential experiment or recording a project-level choice.
If the user declines the proposed strategy, leave `VERIFICATION.md` absent and report the unresolved choices.

After approval, create `VERIFICATION.md` with only accepted current strategy.
Use this structure as applicable:

```markdown
# Verification

## Important risks

- <Durable project risk and why its consequence matters.>

## Evidence ownership

- <System area or claim>: <authoritative evidence owner>.

## Supported mechanisms

### <Mechanism>

Use: <What the mechanism can establish.>
Limits: <What the mechanism cannot establish reliably.>

## Mandatory gates

- `<supported command>`: <what the gate establishes>.

## System sentinels

- <Small end-to-end path>: <risk that it detects>.

## Budgets

- <Runtime or stability constraint and its measurement method.>
```

Omit sections without accepted content.
Record proposed mechanisms in the applicable work item or experiment instead.

Initialization is complete when `VERIFICATION.md` states the accepted strategy and agrees with current executable mechanisms.

## Maintain the strategy

When accepted strategy changes, identify the affected risk, evidence owner, mechanism, gate, sentinel, or budget.
Confirm the current mechanism against executable code or configuration.
Obtain user approval before adding a new project-level policy or mechanism.
If the user declines the revision, leave `VERIFICATION.md` unchanged and report the unresolved conflict.
After approval, update `VERIFICATION.md` and remove the replaced statement in the same change.
Do not add task history, proposed work, or implementation summaries.

Maintenance is complete when `VERIFICATION.md`, relevant executable mechanisms, and repository instructions agree on the changed strategy.
