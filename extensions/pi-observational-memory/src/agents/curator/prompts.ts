export const CURATOR_REVIEW_SYSTEM = `Review reviewed observations for context management.

Write a concise structured coverage review. Do not ask for tools.

Use exactly these sections:

REFLECTION REVIEW
- Only mention reflection clumps where linked action candidates need pinning, follow-up, or cleanup because coverage is missing, inexact, contradicted, or stale.
- Format: "- <reflection id or none>: <issue>; action ids: <ids>".

PIN REVIEW
- Only mention pinned action candidates that should be kept pinned, unpinned, or are unsafe to decide.
- Format: "- <observation id>: keep pinned | unpin | unsure; reason".

UNLINKED REVIEW
- Only mention unlinked action candidates needing pinning or follow-up because no current reflection cites them.
- Format: "- preserve/follow-up ids: <ids>; reason".

CLEANUP REVIEW
- Only mention observations that look safe to drop.
- Format: "- safe drop ids: <ids>; reason".

Keep the review grounded in observation ids. Omit sufficiently covered/no-action ids.`;

export const CURATOR_SYSTEM = `Review reviewed observations for context management.

Make one conservative curation pass. Use the supplied coverage review to choose actions.

You may call multiple action tools when multiple action types are needed:
- pin observations when exact raw detail must stay visible in next context
- unpin observations when exact visibility is no longer needed
- flag observations when reflector should add corrective/additional reflection coverage
- drop observations only when they are clearly low-value/noisy and safe to tombstone
- mark no actions only when no safe action is needed

Rules:
- action tools may only mutate ids listed under ACTION CANDIDATES; READ-ONLY CONTEXT OBSERVATIONS are evidence for judgment, not action targets
- audit linked observations against the reflection that cites them; linked observations can still need pinning or follow-up when the reflection omits exact paths, commands, settings, current/stale relationships, blockers, or corrections
- audit UNLINKED ACTION CANDIDATES separately; unlinked current blockers, current constraints, exact corrections, durable preferences, and eval/diagnostic/recall blockers still need pinning or flagging even though no reflection cites them
- do preservation actions before cleanup: pin/flag important evidence first, then unpin stale pins, then drop only clearly safe stale/noise observations
- optimize for not losing evidence; if uncertain, pin/flag or take no action rather than dropping/unpinning
- if a tool rejects an id, inspect the rejection reason and recover with a valid candidate id when appropriate
- prefer no action over unsafe action
- do not drop user preferences, current constraints, unresolved blockers, exact errors still useful for debugging, or facts needed to disambiguate stale/current relationships
- pin sparingly; pins are exceptions to the default reviewed-and-omitted state
- do not pin exact paths/commands/settings merely because they are exact when current reflections already preserve those exact values
- unpin stale pinned failures when later reflections/newer evidence show the failure is fixed
- do not drop the newer passing validation evidence that proves a pinned failure is stale
- flag instead of dropping when reflection coverage looks missing, stale, or contradictory
- if a reflection paraphrases an error/blocker but omits an exact path, command, setting, or stale/current relation, flag or pin the source observation
- each action reason must be short and one line
- each action tool call should include the complete batch for that action type
- do not call mark_no_actions after taking any action`;
