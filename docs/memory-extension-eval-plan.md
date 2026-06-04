# Memory / Context Extension Evaluation Plan

Status: focus on getting a working context-management stack before optimizing security or writing a custom extension.

## Current direction
Do not build our own session-memory extension first. Evaluate existing Pi extensions one by one, using source inspection and repeatable evals.

Candidate extensions:

```text
pi-blackhole             -> unified VCC-style compaction + observational memory
pi-observational-memory  -> semantic/session memory + compaction continuity
pi-fork                  -> noisy exploration in child sessions
pi-vcc                   -> deterministic transcript views + recall
pi-rtk-optimizer/log-sieve -> tool-output reduction
pi-minimal-subagent      -> named clean-context advisors/reviewers
pi-codemapper            -> lower-noise codebase exploration
```

## Working hypothesis
A good stack may be layered:

```text
tool-output optimizer
  -> less noise enters any context

fork/subagents
  -> noisy exploration happens outside main session

observational memory
  -> important decisions/context survive compaction

VCC-style recall
  -> exact old evidence remains recoverable from raw logs
```

But do not enable everything at once. Extension interactions may clash, especially around compaction hooks. `pi-blackhole` exists specifically because standalone `pi-vcc` and `pi-observational-memory` fight over compaction ownership, so it should be evaluated as a combined alternative rather than loading OM+VCC together first.

## Evaluation loop
For each extension:

```text
1. research docs/readme/issues
2. inspect actual source code
3. identify Pi hooks/tools/config/state files
4. create or update eval fixtures
5. run baseline without extension
6. enable extension alone
7. run evals again
8. dogfood briefly
9. record findings/tradeoffs
10. only then combine with previous winners
```

## Baseline first
Before adding extensions, capture baseline behavior:

```text
Pi default compaction
current tool-output behavior
current cost/context growth
ability to answer post-compaction probes
latency during compaction
```

Use both:

```text
existing Pi sessions -> realistic evals
synthetic sessions   -> controlled failure cases
```

## Eval targets
Measure:

```text
continuity after compaction
preservation of decisions/rejected paths
recovery of exact evidence
branch/fork contamination
main-context token growth
compaction latency
background worker cost
agent tool-use behavior
annoyance/friction during normal use
```

## Important known tradeoffs

```text
pi-blackhole
  + combines VCC-style deterministic compaction with OM-style observations/reflections
  + single compaction hook avoids OM/VCC ownership clash
  + per-worker model fallback/cooldowns according to README
  - larger/diverged extension; source review especially important
  - need verify whether combined behavior is better than simpler OM-only or VCC-only

pi-observational-memory
  + semantic importance filtering
  + prepared memory for faster compaction
  - more moving parts: observer/reflector/dropper
  - model cost/background behavior to verify

pi-vcc
  + deterministic, fast, source-preserving recall
  + no LLM compaction cost if it owns compaction
  - agent must know when to recall
  - weaker semantic importance filtering
  - may clash with other compaction owners

pi-fork
  + keeps noisy exploration out of main context
  - extra model calls
  - child extension loading must be controlled
```

## Open decision
After evaluating existing extensions, decide whether to:

```text
use existing stack as-is
write small glue/config/eval layer
fork/copy one extension locally and simplify it
write our own only if existing designs miss the actual need
```

If an extension is giant, that is not automatically bad. It may mean reimplementation is expensive and reuse is better, or it may reveal extractable core ideas.
