# Observational Memory architecture audit plan

## Goal

Simplify and harden the extension before more eval tuning.

Questions:

- What is the actual memory lifecycle from Pi event to compaction context?
- Which parts are essential, duplicated, unused, or unclear?
- Are failures caused by prompts, agent implementation, triggers, or memory semantics?
- Can observer / reflector / dropper stay as concepts while becoming easier to reason about?

## Current high-level flow

```text
Pi extension load
  -> src/index.ts
    -> registerConsolidationTrigger
    -> registerCompactionTrigger
    -> registerCompactionHook
    -> registerAdditiveContext
    -> register commands/tools
```

Runtime state:

```text
Runtime
  -> config
  -> model resolution
  -> consolidation in-flight state
  -> compaction in-flight state
  -> last stage errors
```

Memory pipeline:

```text
Pi messages / branch entries
  -> serializeSourceAddressedBranchEntries
  -> observer agent
      -> om.observations.recorded entries
  -> reflector agent
      -> om.reflections.recorded entries
  -> dropper agent
      -> om.observations.dropped entries
  -> fold/projection
  -> compaction renderer
      additive: Pi summary + OM patch
      replacement: OM rendered summary
```

Actual eval behavior observed:

```text
observer:   active, useful
reflector:  running or due, but emits 0 reflections in checked runs
dropper:    effectively unused because no reflections
replacement compaction: carried by observations
```

## File map to audit

```text
src/index.ts
  Extension registration root. Should make lifecycle obvious.

src/runtime.ts
  Shared mutable state, config loading, model resolution, async task tracking.

src/config.ts
  User-facing and internal tuning knobs. Current trigger knobs are token-based.

src/hooks/
  consolidation-trigger.ts  Main lifecycle pipeline: observer -> reflector -> dropper.
  compaction-hook.ts        Replacement compaction override.
  additive-context.ts       Additive context injection.
  compaction-trigger.ts     Removed: OM no longer schedules compaction; Pi/manual/eval compaction owns timing.

src/serialize.ts
  Converts Pi branch entries/messages/tool results into observer/recall text.
  Important audit area for tool-result policy.

src/agents/
  observer/    Evidence extraction from source messages.
  reflector/   Checkpoint compression from observations.
  dropper/     Observation pruning when reflected/covered.

src/session-ledger/
  types.ts          Memory entry schemas and validators.
  progress.ts       Due-ness / coverage markers.
  fold.ts           Ledger fold into active observations/reflections.
  projection.ts     What memory is visible at compaction boundary.
  render-summary.ts Replacement summary renderer.
  render-patch.ts   Additive patch renderer.
  recall.ts         Source recall for memory ids.
```

## Audit phases

### Phase 1: draw actual control/data flow

Produce a small architecture note from source, not intent.

Focus:

```text
events -> due checks -> agents -> ledger entries -> projection -> rendered context
```

Outputs:

- lifecycle diagram
- list of event hooks and what each can append/render
- list of state transitions and custom entry types
- exact replacement vs additive behavior

### Phase 2: classify complexity

For each module, label:

```text
essential now
useful but unclear
unused in current evals
duplicate responsibility
high-risk / hard to reason about
```

Initial hypotheses:

```text
essential now:
  observer, ledger fold/projection, replacement renderer, recall

useful but unclear:
  reflector, dropper, coverage

high-risk / unclear:
  token-based progress watermarks
  long prompts with conflicting policy
  serializer/tool-result behavior
  compaction boundary synchronization
```

### Phase 3: clarify semantics before code changes

Define terms in code comments/types:

```text
Observation = source-backed evidence record.
Reflection = compact checkpoint fact backed by observations.
Drop = removal of active observation only when reflected enough.
Projection = memory selected for a compaction boundary.
Rendered memory = final text shown to the main assistant.
```

Important decision:

```text
Reflection should not mean both:
  long-term durable profile fact
  session checkpoint summary fact
```

Possible fix:

```text
Reflection = checkpoint fact for compaction.
Later durable memory can be separate if needed.
```

### Phase 4: simplify triggers/progress

Question token watermarks.

Current:

```text
observeEveryMessages
reflectEveryObservations
rawTokensSince*Coverage
```

Candidate direction:

```text
message/count-based due checks + compaction flush
```

Example policy to evaluate, not yet implement blindly:

```text
observe every N source entries / turns
reflect every M new observations
drop when active observations exceed K
always flush observer/reflector/dropper before compaction when due
keep token caps only as safety limits
```

### Phase 5: simplify agents without deleting concepts

Keep concepts:

```text
observer
reflector
dropper
```

Simplify each:

```text
agent.ts:
  run loop + tool schema + validation only

prompts.ts:
  short, non-conflicting policy

shared helpers:
  common validation, ids, token/content caps
```

Reflector hardening target:

```text
Write checkpoint facts for continuing this session after compaction.
Do not require facts to be long-lived beyond the session.
Preserve current/stale/rejected relationships.
Cite supporting observation ids.
```

Dropper hardening target:

```text
Drop only observations whose meaning is represented by reflections.
Start conservative:
  never drop critical/high unless explicit strong support
  cap drops per run
  deterministic guards around LLM proposals
```

### Phase 6: inspect serialization/tool-result policy

Do not deep-design yet. Just map current behavior.

Current serializer question:

```text
What exactly does observer see from:
  user text
  assistant text
  assistant thinking
  tool calls
  tool results
  branch summaries
  custom messages
```

Audit outcome should decide whether to:

```text
include full tool result text
include bounded evidence excerpts
exclude some tool result classes
prefer assistant/user conclusions over raw tool output
```

### Phase 7: tests before evals

No eval reruns during audit unless explicitly requested.

Use only:

```bash
npm run typecheck
npm test
```

Add/adjust unit tests for:

```text
lifecycle due checks
reflector emits checkpoint facts from current-session observations
replacement render includes reflections + observations clearly
dropper cannot drop unsafe observations
serializer behavior for tool results
```

## Success criteria for cleanup

Architecture should be explainable as:

```text
observe evidence -> reflect checkpoint -> drop covered evidence -> render memory
```

And each stage should answer:

```text
When does it run?
What input does it see?
What output does it append?
What invariant protects correctness?
How is it tested?
```

If any stage cannot answer those clearly, simplify it before further quality evals.
