---
name: say-less
description: "[M] Re-explain the preceding assistant message briefly and plainly without changing its meaning."
disable-model-invocation: true
---

Re-explain the assistant message immediately before this skill invocation in plain language.
Preserve its meaning and the project's canonical terms, but briefly explain unfamiliar terms.
Include only necessary context and keep the explanation short.
Do not perform unrelated work, introduce a new recommendation, or silently change the preceding response's conclusion.
If preserving the meaning requires correcting the preceding response, identify the correction explicitly.

Afterward, continue using brief, plain language until the user requests more detail.
