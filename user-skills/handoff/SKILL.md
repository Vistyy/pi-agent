---
name: handoff
description: "[M] Compact the current conversation into a handoff document for another agent to pick up."
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document that lets a new agent continue the current work.
Save the document in the operating system's temporary directory.

Include a `Suggested skills` section.
Recommend each skill that applies to the next session.

Reference existing specifications, plans, ADRs, issues, commits, and diffs by path or URL.
Keep their existing content in the source artifact.

Redact all sensitive information from the handoff, including API keys, passwords, and personally identifiable information.

If the user provides arguments, use them as the focus for the next session.
Prioritize the handoff content for that focus.
