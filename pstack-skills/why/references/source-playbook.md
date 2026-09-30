# Source investigation

These are evidence categories and investigation techniques, not a configured service list. Discover the actual accessible tools and records, inspect their schemas, and adapt the search to the source's organization. One connector may provide several categories. Do not assume a vendor, workspace, table, column, or capability exists.

## Common procedure and evidence record

Start from the code anchor: files, symbols, commits, PRs, linked issues, authors, and relevant dates. Cast a broad first net across accessible sources, then narrow to relevant records. Try multiple phrasings, including business terms and exact errors. Read complete records and discussions, follow related records, and preserve contradictions. Carry cross-source leads through the investigation rather than treating each category as a sealed silo.

For every search, record the source and scope, exact query or command, time window, records opened, relevant results, and limits. Keep failed or empty searches distinct from inaccessible sources, retention gaps, and justified exclusions.

For every finding, capture:

- Category and source; record type and precise locator (URL, commit, file and lines, ticket, thread, event, dashboard, or dataset/query identifier).
- Author or owner and relevant dates where available. Distinguish creation, revision, merge, deployment, and observation dates.
- The exact motivation quote, or the actual measured result and query that produced it. Do not round a partial record into a confident summary.
- Relevance to the target; direct versus circumstantial support; the inference chain and alternative readings.
- Contradictions, missing context, inaccessible linked records, and additional leads.

Keep quantitative evidence compact: counts, distributions, percentiles, first/last-seen times, and the exact query are more useful than dumps of raw rows. Use the evidence guide to calibrate claims; matching dates or matching thresholds do not by themselves establish motivation or causation.

## Category guides

Read a category guide only when an accessible source in that category will be investigated. Do not load all guides merely because they are listed. If another source becomes relevant through a lead, load its guide then. Preserve the skill's coverage and justified-exclusion rules; selective reading is not permission to skip accessible evidence.

| Evidence category | Guide |
| --- | --- |
| Source-control history and reviews | [Code archaeology](sources/code-archaeology.md) |
| Issues and tickets | [Tickets](sources/tickets.md) |
| Long-form documents | [Documents](sources/documents.md) |
| Conversations | [Conversations](sources/conversations.md) |
| Infrastructure and runtime observability | [Observability](sources/observability.md) |
| Error and exception history | [Errors](sources/errors.md) |
| Product analytics and data | [Analytics](sources/analytics.md) |

Availability concerns the actual evidence, not the presence of a separate service: a local ADR is a document, and accessible repository issues are tickets. Follow the actual tool capabilities and the investigation's target.

For defensive code where an incident-driven origin is plausible, also read [Incident and postmortem context](sources/incident-postmortem.md). This is a cross-cutting angle, not another source category; otherwise leave that guide unloaded.
