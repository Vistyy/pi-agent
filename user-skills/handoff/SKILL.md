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

Reference each specification, plan, ADR, issue, commit, and diff that is relevant to continuing the current work.
Use an exact path, complete URL, commit SHA, or diff range that uniquely identifies each source artifact.
Verify that each reference resolves.
Link to each source artifact without copying or modifying its content.

Redact all sensitive information from the handoff, including API keys, passwords, and personally identifiable information.

If the user provides arguments, use them as the focus for the next session.
Prioritize the handoff content for that focus.

The handoff is complete when the temporary file exists, includes the requested focus when the user provided one, contains a `Suggested skills` section, contains a resolving reference for every relevant source artifact, keeps source content external, and contains no sensitive information.
