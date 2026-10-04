# Benchmark validation

Validate a measured performance number before reporting it or using it to choose a change. A plausible timing can represent errors, skipped work, a cache hit, a configuration difference, or noise instead of the intended workload.

For a quick ballpark explicitly requested by the user, one run is enough. Still verify correct outputs and that the timed work happened, and label the result as one run. A comparison used to choose an option is not a ballpark.

## Establish the claim and conditions

Write the claim you intend to make, including the metric, unit, workload, and user-visible path. Read the measurement script to establish what it times, counts, and excludes.

Inspect machine load and available resources before running. When other activity cannot be isolated, interleave comparison runs so both sides encounter similar conditions and report the interference. Do not stop unrelated processes without authorization.

## Check what the number means

1. **Identify the limiter.** Use a profile or system counters collected during a diagnostic run to locate the resource or code path limiting the result, then map it to source. Inspect the load generator too; its saturation can hide application performance. Profile separately from reported timing runs because instrumentation can distort the result. Explain a plateau from evidence, not source inspection alone.
2. **Compare representative configurations.** Use production builds and relevant flags, versions, data, batching, transactions, pools, and cache conditions. Tune each candidate for the intended workload when choosing what to adopt. If configurations differ, state what is being compared. Do not claim an implementation is inferior from an untuned configuration. Report an adoption comparison as inconclusive when necessary tuning cannot be checked.
3. **Check physical and end-to-end limits.** Compare throughput with available cores, disk, and network capacity. Compare the claimed time saved with the time the changed component consumed. Removing a component that takes 10% of a run can reduce total time by at most 10%, or improve throughput by about 11%. A result beyond such a limit needs investigation for skipped work, caching, or a measurement error.
4. **Count errors and verify outputs.** Record failures, non-success responses, retries, and timeouts. Check correct results, not just their presence. Fast rejections are not successful throughput. Add error counts to a harness that lacks them.
5. **Repeat and interleave.** For comparison claims, run each side at least five times and alternate sides. Keep warmup and cache conditions comparable. Report the median and range. Treat a gap within run-to-run variation as no measurable difference; use the harness's statistical analysis or an appropriate statistical test when a close comparison needs resolution.
6. **Measure relevance to the user.** Pair a microbenchmark with the end-to-end path the user waits on, using realistic sizes and concurrency. State the component's share of total cost. A helper consuming 1% of request time can save at most 1% of that request's time.
7. **Prove the timed work happened.** Confirm that requests reached the service, rows were persisted, bytes were read, or other intended effects occurred inside the timed region. Count completed work. Await asynchronous work, consume lazy results, and ensure an optimizer cannot discard the computation.

## Report the evidence

Lead with faster, slower, no measurable difference, or inconclusive. Give the metric and unit, before and after values, run count, spread, measured limiter, and error and completed-work observations. Keep detailed runs in a reviewer-accessible artifact when publishing.

If the work or output checks are blocked, the measurement is not a validated comparison. If the limiter is unknown or a candidate could not be configured representatively, report the observation and the missing evidence without claiming a demonstrated optimization or adoption winner. Do not hide uncertainty behind a percentage.
