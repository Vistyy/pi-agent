# Product analytics and data

## What this source contains

Product events and usage, experiment or feature-flag exposure and outcomes, billing and volume, query-cost history, data-pipeline lineage, and available exploratory analyses. This complements operational telemetry by showing product and data conditions that may have shaped the code.

## How to search deeply

Discover actual datasets, schemas, fields, definitions and query capabilities before assuming a table or column exists. Use the real schema/catalog tools and query language. Record which historical data the connector can access; an analysis notebook may exist without being searchable through a query interface.

Time-bound every query around the relevant introduction or deployment. Start with roughly 30 days before and after when appropriate. Prefer verified curated, typed, deduplicated datasets over raw events when their definitions and freshness fit the question. If the relevant window falls inside a refresh lag, examine raw records only with a known deduplication strategy. Never assume an identifier or timestamp convention is universal. If a query runs asynchronously, use the tool's status/result mechanism rather than repeatedly submitting it.

Investigative patterns:

- **Usage trajectory:** daily counts before and after shipping; check whether an apparent launch or disappearance reflects instrumentation changes rather than user behavior.
- **Threshold origin:** distributions, median, high percentiles and maximum in the pre-change period, for example the preceding two weeks. Compare with the code's limit without treating numerical similarity as a documented decision.
- **Experiments and flags:** discover the actual exposure/outcome records and inspect variants, relevant dates and recorded decisions.
- **Cost or volume:** inspect bounded usage, billing or query history that could explain a migration, backfill or performance change.
- **Lineage:** identify upstream definitions and their source-control history; follow that evidence rather than guessing why consumers changed.

## What strong evidence looks like

An explicit analysis or experiment decision linked to the target; recorded rollout decisions; or measured behavior that corroborates a cited rationale. Return the actual dataset, query, time window and compact numeric result. Event ramps, error-count drops, and matching percentiles are circumstantial unless the record connects them to the decision.

## Common pitfalls

Instrumentation changes can create apparent usage changes. Current schemas may differ from those available when the code was written. Raw data may contain duplicates; curated data may lag. Table and property conventions are organization-specific. Query costs and timeouts make unbounded scans unreliable. Retention limits, late pipeline creation, or inaccessible analyses are gaps rather than zero activity. An instrumented event or a temporal correlation is not proof of motivation or causation.
