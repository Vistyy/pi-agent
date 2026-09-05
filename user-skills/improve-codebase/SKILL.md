---
name: improve-codebase
description: "[M] Review a bounded area for consequential structural simplification and recommend a coherent destination and removal path."
disable-model-invocation: true
---

# Improve Codebase

Review the area the user names, or identify one bounded area with evidence of consequential structural cost.
This is a recommendation request, not permission to modify code or work records.

Trace the relevant behavior through its callers, owned rules, state, and verification far enough to explain a present maintenance or coordination burden.
Preserve supported behavior and accepted ownership constraints; existing structure and possible future capabilities are not requirements.
Distinguish a structural cause from incidental cleanup, and do not invent a redesign when the evidence supports no change.

Check applicable known work before claiming a new recommendation.
If existing work owns the complete improvement, point to it rather than proposing duplicate work.
Report any unavailable source that prevents establishing the recommendation's novelty or constraints.

Recommend the simplest coherent destination supported by the evidence, not merely the smallest first diff.
Explain the current burden, what the destination removes, and the caller migration, obsolete-path deletion, and verification needed to reach it.
Use stages only when they make the transition safer or necessary; give every temporary path a removal condition.
Keep costs, risks, and unresolved decisions explicit without expanding the review beyond the diagnosed problem.

Return a concise recommendation grounded in specific code, callers, and applicable work records, or explain why no material structural change is warranted.
