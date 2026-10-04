# Optimization strategies

## Prefer less work before cheaper work

Use this order to choose among hypotheses supported by the trace and the architecture:
1. Eliminate unnecessary work.
2. Avoid repeating work.
3. Reduce the amount of work.
4. Defer work until needed.
5. Move work outside the user-visible wait.
6. Run independent work concurrently.
7. Make the remaining operations cheaper.

This is a preference order, not seven required experiments. Skip mechanisms that do not fit the evidence or would change required behavior. For a one-off fix, stop when verified behavior and performance meet the target. Hillclimb uses the same order but retains its own agreed budget and stop condition.

## Choose a concrete mechanism

Most fixes come from eight strategy families. Use them as hypothesis generators, not a checklist. A family earns an attempt only when the trace shows the signal it names.
- **Elimination.** Before optimizing the hot path, ask whether it needs to exist: a computation nobody consumes, a feature gate that's always off for this user, a sync that redundantly mirrors state, a legacy path kept "just in case". The trace shows what's slow, never that it's deletable, so this family needs an architecture and behavior investigation, not just the profiler.
- **Divide and conquer.** The dominant cost scales with input size. Split the work so each piece touches less (chunk, shard, prune the search space) or so independent pieces run in parallel.
- **Caching.** The same computation or fetch repeats on identical inputs. Store and reuse the result. Name what invalidates it before claiming the win.
- **Indirection.** The hot path does expensive work a cheaper intermediate could absorb: an index instead of a scan, a queue that shifts work off the interactive thread, a handle that lets a cheaper implementation swap in. Add the hop only when it removes more from the critical path than it adds.
- **Batching.** Many small operations each pay a fixed overhead (RPC, query, syscall, draw call). Coalesce them to pay the overhead once per batch.
- **Redundancy.** The wait hangs on one slow instance or attempt. Duplicate the work (replicas, hedged requests, speculative execution) and take the fastest result. The trace has to show the wait dominates and the system has headroom.
- **Lazy evaluation.** Cost lands on results that are never used or not needed yet (eager init on the boot path, rendering offscreen items). Defer the work until first use.
- **Scheduling.** The work must happen, but not during the interactive moment. Move it to where nobody is waiting: idle callbacks, a background warmup after boot, precompute before the user arrives, cleanup after the frame commits. The win is perceived latency, so measure the interactive path, not total work done.
