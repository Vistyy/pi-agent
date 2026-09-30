# Infrastructure and runtime observability

## What this source contains

Service ownership and dependencies, metrics, monitors and alerts, dashboards, logs, traces, incidents, investigative notes, and available build or deployment records. This is operational reality, not necessarily a record of the team's intent.

## How to search deeply

Identify the affected service, component, dependency and environment. Inspect relevant dashboards and alerts for watched conditions, queries and thresholds. Read metric definitions, units and tags before interpreting timeseries. Search bounded logs and traces by symbols, endpoints and error strings; narrow by service and environment, and aggregate when the question needs counts rather than individual records.

Start with a time window around introduction or deployment, often approximately 30 days before and after, and widen for a stated reason. Compare behavior before and after the change, inspect incidents in that period, and retrieve complete timelines or postmortems. Link operational signals to the exact change; inspect neighboring deployments and changes that could explain the same pattern. For pipeline evidence, distinguish a recorded build/deployment outcome from a documented reason for choosing the design.

## What strong evidence looks like

An incident record explicitly tying the target to a corrective action, an author's explanatory note, or a monitor, log or trace demonstrating the actual condition the code addresses. A matching threshold or a spike followed by stability supports an interpretation, but does not alone establish why the code was written or which change caused recovery.

## Common pitfalls

Correlation is not causation. Charts reflect their creators' framing; finding a relevant chart does not prove that it motivated the code. Instrumentation shows what someone measured, not necessarily why they changed the system. Renamed metrics, sampling, missing tags and retention limits can hide history. Unbounded log searches produce noise and timeouts. Different deployments, environments or neighboring fixes can confound the comparison.
