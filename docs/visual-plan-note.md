# Visual Session State / Plan Preview Idea

Status: parked, but still potentially useful as a UI layer. Keep separate from memory/compaction evaluation.

## Problem
Text-only planning and long exploratory chat make it hard for the user and agent to share the same mental model. The user may want a lightweight always-visible preview of:

```text
where are we?
what is the current direction?
what is unresolved?
what is the next likely move?
```

This is different from building a full memory system.

## Current framing
Treat visual/session-state UI as a projection, not the canonical memory.

```text
memory / compaction extension
  -> provides current state/context

widget / overlay
  -> renders a small preview for human orientation

plan module, maybe later
  -> only if committed task/progress tracking becomes useful
```

## Desired UI surfaces

```text
compact widget
  -> tiny current-state/plan preview

side overlay or command view
  -> richer session map when requested

optional web sidecar later
  -> only if terminal UI is insufficient
```

## Possible compact widget content

```text
Focus: evaluating Pi memory/context extensions
Now: baseline -> OM -> fork -> VCC
Open: eval harness, compaction owner, extension interactions
Parked: custom scribe extension, visual board, heavy schema
```

The widget should show orientation, not enforce lifecycle.

## Visual forms discussed

```text
status strip      -> current focus / next move
thread list       -> live unresolved topics
decision list     -> current conclusions / rejected paths
system map        -> components and relationships
flow map          -> what happens next
decision tree     -> why one path was chosen/rejected
risk graph        -> what can go wrong and mitigations
progress map      -> where we are in the design/work
```

## Concerns

- Widget may become clutter.
- Visual plan may prematurely turn tentative ideas into commitments.
- A task lifecycle can constrain the LLM awkwardly.
- UI constraints should not pollute the memory model.
- Manual approval/review flows may become annoying.
- Need avoid mixing working context with committed plan.
- Need decide what state source feeds the widget.

## Useful Pi references
Plannotator was inspected as a related Pi extension.

Plannotator patterns worth remembering:

```text
phase machine
hidden context injection
session custom entries
status/widget display
browser annotation/review UI
plan file + checklist parsing
restoring state from session entries
```

But Plannotator is a plan approval workflow, not the same as a passive session-state preview.

## Possible future direction
Once memory/context extension evaluation is complete, revisit whether a visual/widget layer should consume the selected state source.

Possible architecture:

```text
observational memory / session summary / eval state
  -> session-state projection
  -> compact Pi widget
  -> optional command/overlay detail view
```

Open question:

```text
Should the widget show derived session state, a plan, or both as separate views?
```
