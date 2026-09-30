---
name: why
description: >-
  Use for "why does X work this way", "why we picked Y", historical design
  rationale, regressions or postmortems needing historical context, and
  data-backed thresholds. Anchor the question in code and history, investigate
  accessible evidence across source categories, and distinguish documented
  reasons from inference. Use how for current runtime behavior.
---

# Why

Investigate the motivation and intent behind code. How explains what the code does; Why investigates the forces that led to its shape. Conduct the investigation and synthesis directly in the main agent.

This is read-only work. Do not modify the code, commit, change external records, or configure new services as part of answering the question. Use the integrations actually available in this environment; a reference guide is not proof that a service is accessible.

Read [Evidence and confidence](references/evidence.md) in full before investigating. Read the small [source index and common instructions](references/source-playbook.md), then load only the individual guides for accessible categories you will investigate. Do not read every linked guide just because it is listed. Preserve the separation between collecting evidence and drawing conclusions.

## 1. Understand the target and question

Identify the code, pattern, feature, threshold, or design decision under discussion, and the rationale, tradeoff, motivating edge case, external constraint, or history the user wants explained.

If the target is vague, infer the referent from conversation context, state your interpretation briefly, and proceed so the user can redirect. Treat any explanation embedded in the user's question as a hypothesis to check, not a conclusion to confirm.

## 2. Establish the code anchor

Gather relevant file paths and line ranges, key symbols, recent commits touching the target, associated PR or review identifiers, and linked issue IDs. Read code to understand the target, not to deduce the author's intent.

Start with blame and file history through renames, then inspect substantive patches and their review context. Extract PR numbers from commit messages where present; do not assume every change has a PR or that all history survives in the checkout. When tracing history, read [Code archaeology](references/sources/code-archaeology.md) for the Git techniques.

Record the anchor and relevant dates. Use them to seed every source search and relate records to the code's introduction, revision, and deployment. Do not assume the most recent commit explains the current shape.

## 3. Discover sources and establish coverage

Inspect the available tool descriptions, schemas, CLI capabilities, and known repository resources. Map actual searchable evidence to these categories:

1. Source-control history and reviews.
2. Issues and tickets.
3. Long-form documents.
4. Conversations.
5. Infrastructure and runtime observability.
6. Error and exception history.
7. Product analytics and data.

A connector can expose several categories, and a category can have several sources. Map capabilities rather than choosing one primary category for an entire connector. Local documents and CLI access count; an MCP is not required. Adapt the search procedure to the real tool schema and source organization, not an assumed vendor API.

Build a complete coverage map. Search every accessible category unless it is provably irrelevant, not merely probably irrelevant. Cover the accessible sources within it; do not silently omit another repository, tracker, or document store carrying relevant evidence. Explain any unavailable source, access failure, unsearched source, or justified exclusion. Distinguish these from searches that ran and returned nothing.

The seven categories are a coverage map, not a reason to ignore other relevant evidence. Record sources whose capabilities are unclear and resolve that uncertainty before claiming coverage.

For a genuinely trivial target whose PR already contains the complete answer, an inline answer is allowed only after confirming that searches across all seven categories would be redundant. State that justification. Do not replace broad investigation with a Git-only default.

## 4. Collect evidence broadly, then deeply

Make an initial broad pass across the coverage map, then pursue relevant records in depth using the category guide.

- Record the actual queries, time windows, records opened, and search results, including null results and limits.
- Read full PR discussions, tickets, documents, and threads, not titles or previews. Quote the exact wording when it bears on the rationale.
- Follow related commits, parent and duplicate tickets, document links, and discussion threads. Follow cross-source leads rather than leaving them as unexamined references; update the coverage record as you do.
- Preserve contradictory records and alternative readings. Ask what evidence you would expect if the current explanation were wrong.
- For defensive code where an incident-driven origin is plausible, read [Incident and postmortem context](references/sources/incident-postmortem.md) and investigate that history across the accessible categories. Connect action items, error trajectories, and runtime or product signals to the code's dates. Do not treat a coincident improvement as proof of causation.
- Note gaps precisely: the question, source, query or records checked, and what remains unanswered. Never substitute findings about a nearby feature for evidence about the actual target.

Keep an evidence record with the source, locator, author and dates where available, quote or measured result, relevance, direct versus circumstantial support, contradictions, and additional leads. Gather this before forming the final narrative; do not tidy inconvenient evidence away.

## 5. Synthesize and check

Read the collected findings together. Reconcile overlapping records without counting repeated copies of one claim as independent corroboration. Surface disagreements rather than choosing the source that makes a cleaner story.

Classify claims as Direct, Supported, Inferred, Speculative, or Unknown using the evidence guide. Make inference chains explicit and present competing hypotheses when the record does not support a single answer. Missing evidence does not establish that a concern never existed.

Spot-check citations against their actual records, especially where a claim depends on a paraphrase, uncertain locator, or conflicting evidence. Check confidence language against the evidence. This is the same agent's verification, not an independent review.

Before presenting, check that:

- Direct and Supported claims have precise citations and enough evidence for their wording.
- Inferences and speculation are labeled rather than presented as documented intent.
- No claim treats mechanics or present-day plausibility as evidence of historical motivation.
- Contradictions, access and retention limits, null searches, and unresolved questions remain visible.
- The user's starting hypothesis was investigated rather than simply affirmed.

## 6. Present the answer

Use these sections as appropriate to the question while keeping the confidence separation and source coverage intact:

- **The question.** Restate the target rationale.
- **The code in question.** File paths, line ranges, and symbols.
- **What we found.** Label each claim **[Direct]** or **[Supported]**, with citations and relevant quotes or evidence.
- **What we can reasonably infer.** Hedged claims with visible reasoning; omit if there are none.
- **Competing hypotheses.** Evidence for and against each viable reading; omit when the record supports one answer.
- **What we don't know.** Specific unanswered questions, null searches, unavailable evidence, and people who might know but were not consulted. Do not invent a gap if the evidence really is complete.
- **Sources consulted.** One entry per category identifying the sources and searches performed, including empty results, unavailable sources, access limits, and exclusions with reasons. Include any relevant sources outside the seven-category map.
- **Confidence summary.** Which parts are documented, inferred, or unresolved.

If this investigation precedes a code change, translate the historical findings into **Preserve / Change / Avoid / Risk** constraints. Historical intent is evidence for planning, not automatic authority over current requirements.
