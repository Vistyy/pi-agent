# Incident and postmortem angle

This is a cross-cutting search, not another category. When the target is defensive—null guards, retries, timeouts, rate limits, feature flags, egress checks, or memory protections—look for incident origins across the accessible sources.

Search documents for postmortems, tickets for incident or reliability follow-ups, conversations around the relevant incident dates, history for fixes/reverts/reapplications, and operational or error records for matching conditions. Where product events classify user-visible failures, compare their trajectory around the change without mistaking correlation for causation.

Read complete postmortems and their action items. Connect identifiers and dates across the records: an incident linked to a ticket, document, discussion and review can provide substantially stronger support than an isolated signal. Skip this extra angle when the code does not make an incident-driven origin plausible; do not invent an incident to explain an ordinary implementation.
