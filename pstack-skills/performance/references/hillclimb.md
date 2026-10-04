### Hillclimb

**Own the metric and the experiment's integrity. Run and review the attempts.** For sustained, iterative improvement of one measurable thing against a target. A one-off fix is Bug fix or Perf issue. This is the loop.

Core discipline: one change, one measurement, keep or revert. Never stack untested changes, and never claim a win from code inspection.

1. Ground the workload and architecture before choosing the metric. Trace the target's architecture and runtime flow, name the realistic workload dimensions that can move the result (data size, history, state, concurrency), and select a case that reproduces the user's complaint. If no case reproduces it, fix the repro instead of hillclimbing. Then fix one metric, the direction that counts as better, and a checkable stop condition with a target and an effort budget. Use the user's numbers when given, otherwise agree them. Require repeatable evidence beyond noise rather than a default minimum number of attempts.
2. Build the measurement harness, prove its sensitivity, then freeze it. Run contrasting realistic workloads and confirm the target case reproduces the symptom while easier cases separate as expected. If the harness cannot distinguish them, revise the workload or metric. Follow [Benchmark validation](benchmark-validation.md) before freezing the harness. Make the command report errors and completed work alongside timing so a failed or skipped workload cannot look like a speedup. Once frozen, one repeatable command emits the metric, sampled enough to clear the noise (median of N, not a single run). Record the baseline metric and a green run of the regression gate (the tests that must keep passing) before any change.
3. Open a local decision log. A `decision.tsv`, one row per attempt: id, hypothesis, change, before, after, delta, tests, verdict (kept or reverted), note. Read it before each attempt. Keep it local; commit evidence only when the agreed workflow calls for an audit trail.
4. Ground each hypothesis in the architecture model from step 1, so it names a specific mechanism ("defer X off the boot path because it blocks first paint"), not "try memoizing something". Order evidence-supported hypotheses using [Optimization strategies](strategies.md). Borrow the order, not the one-off workflow's stop rule.
5. Loop, one hypothesis per iteration:
   - Implement one scoped hypothesis and review the diff before measuring it.
   - Measure before and after with the frozen harness, check the error and completed-work counts against the intended workload, and run the regression gate.
   - Accept only when the metric moves past noise and the gate stays green. Otherwise revert the task-owned candidate change in full. A tweak that "might help" is not kept.
   - Keep each accepted fix as a separable unit. Commit only when authorized by the agreed workflow, staging only the files you changed (`git add <files>`, never `-A`). Log the row either way, kept or reverted.
   Each iteration ends in a check before the next begins. Unattended operation requires an agreed scope, budget, and stop condition; this skill does not install a wake or loop mechanism.
6. Re-examine a plateau within the agreed effort budget. On a stall, several rejects in a row, pivot category, combine near-misses, re-read the source, or try something more radical before concluding the hill is climbed. Correctness and simplicity outrank the number. Revert a win that breaks behavior, and keep a simplification that holds the number.
7. Stop when the condition is met, the agreed budget is exhausted, or the remaining ideas are marginal and not worth their cost. Don't relax the predicate to meet it, and don't quit while cheap untried hypotheses remain. If you are stuck, surface it instead of spinning.
8. Deliver the accepted changes as ordered, verified units. Commit or publish only through the agreed workflow.

**Reply:** the metric and target, baseline to final with the percent delta, iterations run (kept vs reverted), each accepted fix on one line, the `decision.tsv` path, and the best idea you would try next if pushed further.
