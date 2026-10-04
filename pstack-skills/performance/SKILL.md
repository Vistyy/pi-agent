---
name: performance
description: >-
  Use for measured latency, CPU, memory, or throughput problems, diagnosis from
  live or supplied profiling captures, and sustained runtime-performance
  improvement. Guides workload selection, measurement, trace-driven hypotheses,
  and verification. Not for ordinary code cleanup or prompt/skill evaluation.
---

# Performance

Choose the workflow from the requested deliverable before making changes:

- For a one-off measured performance problem, follow the workflow below.
- For sustained improvement of a runtime metric against a target, read [Hillclimb](references/hillclimb.md).
- For diagnosis from a running application, read [Runtime forensics](references/runtime-forensics.md).
- For diagnosis from an existing profiling capture, read [Trace forensics](references/trace-forensics.md).

Diagnostic work may include instrumentation and temporary live-code changes within the task's scope and permissions. Identify the affected instance and record the baseline, intervention, and restoration plan. Use isolation where practical, not as a blanket prerequisite that prevents examining the affected instance. A diagnostic request does not imply an unrequested permanent fix. Honor an explicitly read-only request.

Before reporting or acting on a measured performance number, read and follow [Benchmark validation](references/benchmark-validation.md). Hold the workload and capture conditions constant and sample enough to distinguish improvement from noise. Keep correctness checks passing. Do not treat an optimization strategy as permission to change supported behavior or duplicate side effects.

## One-off performance issue

**Plan, review, and verify the measurements.** Tie every fix to a measurement, don't read source instead of measuring.

1. Capture a baseline trace through the affected application's supported surface, using the existing harness or available profiling tools. Validate the baseline and every later measurement with Benchmark validation.
2. Ground hypotheses in the affected architecture and runtime flow. Don't claim a perf ceiling without running it first.
   Read [Optimization strategies](references/strategies.md) for trace-grounded candidate mechanisms and their preference order. Stop when a verified fix meets the one-off target.
3. Plan the fix from the trace. If it changes core data shapes, contracts, or module boundaries, resolve those design decisions before implementing. Implement the scoped fix and review the diff. Capture a post-fix trace.
   Verify each attempt before trying the next.
4. Parse and compare the artifacts (JSON to sqlite, diff). "Inconclusive" or wrong-surface is not a pass. Flag it.
5. Cite the measurements and artifact paths in the deliverable.
6. Commit or publish only through the agreed workflow.

For sustained improvement against a metric rather than a one-off fix, use [Hillclimb](references/hillclimb.md).

**Reply:** verdict, baseline number, post-fix number, delta, run count and spread, measured limiter, artifact path, and any measurement limits.
