# Session Working Memory Idea

Status: parked visual/plan UI; focus first on working/session memory.

## Problem
Long exploratory sessions lose important context. Ideas, rejected paths, unresolved threads, and decisions live only in linear chat. Compaction helps but is prose-heavy and lossy.

## Current direction
Build a Pi extension that maintains lightweight session-tied working memory outside the main model context.

Core split:

```text
main agent = reasons/decides/acts
session memory = external state for current session
scribe = observes deltas and maintains state
```

## Scope for first pass
Working/session memory only:

- current topic map
- unresolved threads
- decisions / rejected paths
- active assumptions
- current focus
- compact snapshot for main agent

Not in first pass:

- visual board / plan widget
- project-wide semantic memory
- context DB / source index
- cross-session promotion

## Design principles

- Session memory is context, not truth.
- Current user message overrides memory.
- Scribe tracks; main/user decide.
- Use delta updates, not full-session rewrites.
- Separate working context from committed plan.
- Preserve rejected paths and unresolved threads.
- Keep provenance to session turns where possible.
- Avoid always injecting large memory into the prompt.

## Possible Pi extension shape

```text
session_start
  -> create/load session memory file

message/agent events
  -> collect latest conversation delta
  -> update memory state

before_agent_start
  -> optionally inject compact snapshot

commands/tools
  -> get_session_memory
  -> mark_topic
  -> record_decision
  -> correct_memory
```

## Open questions

- Exact schema for topics/decisions/unresolved threads.
- Whether scribe is deterministic first or LLM-assisted from start.
- When compact memory is injected vs queried by tool.
- How main agent marks topics resolved without corrupting state.
- How to handle corrections/reverts cheaply.
