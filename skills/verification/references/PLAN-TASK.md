# Plan a Task

The planner owns the Task Verification Contract.

## 1. Draft the contract

Use the Task's Material Risks and Verification Claims.
Select the least costly evidence that can establish each Verification Claim reliably.
Include mandatory repository gates.
Keep behavioral acceptance criteria separate from the Task Verification Contract.

Use this structure and omit empty optional sections:

```markdown
## Verification

### Material risks

- <Plausible failure and meaningful consequence.>

### Required claims

- <Specific fact that evidence must establish.>

### Required evidence

- <Mechanism, observation, artifact, and applicable seam.>

### Escalation

- <Condition that requires a planning amendment or user decision.>

### Not required

- <Likely scope misunderstanding that is explicitly excluded.>
```

When the Task has no Material Risk that needs new evidence, use this minimal form:

```markdown
## Verification

Existing type checking and the repository gate provide sufficient evidence.
No new durable test is required.
```

This step is complete when every Material Risk maps to sufficient required evidence and no evidence item exists only by convention.

## 2. Review feasibility

Confirm that the required mechanisms and seams exist.
When a consequential technique is unknown, define how planning will resolve it.
Do not assume that a future implementer or reviewer has an unavailable tool.
Submit the Task Verification Contract through the project's Task approval workflow.
When that workflow has no independent reviewer, obtain user approval.
If approval is denied, keep the Task unapproved and report the unresolved concern.

Planning is complete when the Task Verification Contract is feasible, proportionate, part of approved Task Context, and approved.
