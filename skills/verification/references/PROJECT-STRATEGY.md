# Manage Project Verification Strategy

## Initialize the strategy

When no project verification strategy exists, first determine whether the project has durable, cross-work verification decisions that are not sufficiently clear from a more authoritative source.
Keep a separate strategy absent when applicable instructions, executable configuration, current documentation, and approved work-specific plans already provide sufficient guidance.
Do not create a strategy to repeat this skill, list commands, restate configuration, describe product behavior, preserve temporary history, or record unapproved proposals.

When a project strategy is justified, inspect applicable instructions, supported gates, test configuration, verification tools, representative checks, and accepted decisions.
Identify recurring evidence patterns, important uncovered risks, expensive mechanisms, and known instability.
Do not infer accepted policy only from historical tests.

Research an unfamiliar mechanism when it could change the project strategy.
Obtain approval from the applicable authority before running a consequential experiment or recording a project-level choice.
If approval is declined, leave the strategy unchanged and report the unresolved choices.

After approval, record only accepted current strategy that changes verification decisions across work.
Use the project's established strategy artifact when one exists.
Otherwise, use `VERIFICATION.md` when repository-local Markdown is an appropriate authoritative medium.
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

Initialization is complete when either no separate strategy is justified or the accepted strategy agrees with current executable mechanisms and applicable instructions.

## Maintain the strategy

Apply the initialization admission test to every retained statement.
Remove generic guidance and claims owned sufficiently by applicable instructions, executable configuration, current documentation, or approved work-specific plans.
If no project-specific strategy remains, obtain approval from the applicable authority and remove the strategy artifact.

When accepted strategy changes, identify the affected risk, evidence owner, mechanism, gate, sentinel, or budget.
Confirm the current mechanism against executable behavior or configuration.
Obtain approval from the applicable authority before adding a new project-level policy or mechanism.
If approval is declined, leave the strategy unchanged and report the unresolved conflict.
After approval, update the strategy and remove the replaced statement in the same change.
Do not add work history, proposed work, or implementation summaries.

Maintenance is complete when no separate strategy is justified or every retained statement agrees with relevant executable mechanisms and applicable instructions.
