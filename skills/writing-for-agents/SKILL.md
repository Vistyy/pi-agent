---
name: writing-for-agents
description: Use when creating, materially changing, or auditing instructions consumed by agents, including AGENTS.md, system or role prompts, skills, tool guidance, and conditional references. Skip copy edits, ordinary technical documentation, and routine updates whose behavior and owner are already settled.
---

# Writing for agents

Add or retain guidance only when it prevents a concrete failure or ambiguity, supplies knowledge the agent cannot reliably obtain from its environment, or establishes a necessary boundary. Preserve explicit user and project constraints and higher-authority meaning while simplifying.

## Choose a reliable owner

Inspect the instruction layers the target agent will actually receive. Describe the current contract directly. Remove obsolete guidance instead of preserving it as softened wording or a note about what changed; keep history only in artifacts whose purpose is historical.

- Use schemas, configuration, or runtime controls for constraints they can actually enforce.
- Put universal mandatory safety and authority in reliably loaded instructions, not only in a conditional skill or reference.
- Use skills for specialized conditional operational knowledge.
- Put operation-specific inputs, effects, and mechanics in the owning tool's schema or description.
- Put branch-specific procedure in a conditional reference. State what it contains and when to load it beside the link in the referring instruction; do not repeat that load condition inside the reference, where it can no longer guide loading.

Do not copy easily inspected environment or configuration into prose unless the lookup is unreliable or the rationale changes behavior.

Across a boundary, state the actor, responsibility, authority, triggering inputs or conditions, and required outcomes or guarantees. Leave providers, tools, commands, storage, polling, and other implementation mechanisms with their narrow owner unless the higher-level behavior inherently depends on the exact mechanism.

## State outcomes before methods

State the required judgment, boundary, or observable outcome. Do not prescribe a reasoning process, checklist, or taxonomy unless following that method is itself necessary for correctness, safety, or reliable completion.

Use an ordered procedure only when order matters. State an observable completion condition when ambiguity could cause the actor to stop too early or continue unsafely. Keep requirements direct; use rationale or examples only when they change how the boundary is understood.

## Design skill routing

Read the target harness documentation before changing skill discovery, invocation, or frontmatter; do not copy its current mechanics into the skill. Establish which metadata is visible before invocation, how bodies load, and how automatic and manual invocation differ.

A discoverable description names the capability and the tasks that should trigger it, distinguishes meaningful adjacent non-matches, and leaves the method in the body. Choose discoverable or manual-only invocation deliberately using the harness's supported mechanism. A skill should supply specialized operational knowledge or address a concrete failure, not restate a generic tutorial.

## Validate consequential behavior

Validate the artifact's syntax, discovery, and intended visibility in the target harness. When routing changes materially, check a representative matching task and an adjacent non-matching task. Use model invocation experiments only when consequential uncertainty remains; treat them as bounded evidence, not proof of reliable future selection. A forced invocation establishes that the body can load, not that autonomous routing works.

## Check instruction artifacts with Writ

For instruction files in Writ's supported repository scope, run the exact released CLI on demand after making material changes. Replace `<root>` with the target repository root.

```sh
pnpm dlx @syzom/writ@0.1.0 check --root <root>
```

The check itself is deterministic and makes no model calls, though the first `pnpm dlx` invocation may require registry access. Run the paid semantic checks when auditing their target behavior or after materially changing it, and only when `TYPESAFE_API_KEY` is available:

```sh
TYPESAFE_API_KEY=... pnpm dlx @syzom/writ@0.1.0 routing --root <root>
TYPESAFE_API_KEY=... pnpm dlx @syzom/writ@0.1.0 references --root <root>
```

Use `routing` for skill discovery metadata and `references` for instruction-loading references. Treat semantic findings as bounded evidence and apply judgment rather than rewriting instructions solely to satisfy a score. Consult [Writ's documentation](https://github.com/Vistyy/writ#readme) for its supported scope, privacy boundary, outcomes, and limitations.
