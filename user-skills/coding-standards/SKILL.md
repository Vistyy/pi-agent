---
name: coding-standards
description: >-
  Use when creating, clarifying, or maintaining CODING_STANDARDS.md, including
  standards proposals from Reflect. Turn confirmed coding decisions into scoped
  judgment-call guidance, reconcile existing rules, and remove proven obsolete
  or duplicate guidance. Not for merely consuming standards during review or
  Deslop, ordinary implementation, or a general code review.
---

# Create and maintain coding standards

`CODING_STANDARDS.md` contains optional supplemental guidance for coding decisions that need judgment. Review and Deslop consume it, not ordinary implementation. General code-quality expectations still apply without a standards document.

Turn an explicit coding decision or an evidenced lesson into useful standards. Follow the caller's scope and authorization. When Reflect consults this method, keep changes as proposals until the user approves them. A direct authoring request permits the requested edits without requiring a retrospective.

## 1. Establish the decision

Identify the situation, affected code, expected choice, and reason the decision matters. Read relevant guidance, contracts, dependency versions, and the evidence behind the proposed rule.

Distinguish confirmed decisions from suggestions and incidental existing patterns. Repetition in the codebase does not establish that a pattern is good or endorsed. Do not infer a comprehensive style guide from current code. Ask about unresolved policy choices rather than silently making them.

Check whether existing instructions or tooling already cover the decision. If a type, lint, test, or runtime check can enforce the constraint, prefer that mechanism. Follow [Encode Lessons in Structure](../../pstack-principles/principle-encode-lessons-in-structure/SKILL.md). If implementing the mechanism is outside scope, report that proposal instead of substituting a prose rule.

## 2. Choose the document and scope

Read existing applicable standards before choosing a home. Use the document's stated scope and project guidance to distinguish project, subtree, and personal rules. Do not invent precedence for conflicting rules. Resolve a material conflict with the user before changing policy.

Update an existing document when it owns the decision. For a new project-wide file, prefer the repository root. Scoped files can live beside applicable project guidance, and personal files beside user instructions. Use an explicit document pointer when choosing another location.

Begin the document with a short explanation of its purpose and the code or projects it governs. State that it supplements code-quality review and Deslop rather than replacing general quality judgment. Make rule conditions and exceptions clear so readers can apply the document without loading this authoring skill.

Create the file only when there is a useful decision to record. Do not create an empty scaffold or require standards in projects that have none.

## 3. Write a rule that changes a decision

Use [Technical Writing](../../pstack-skills/technical-writing/SKILL.md) for the prose. Each rule should make these points clear:

- When and where the rule applies.
- What choice to make and the concrete reason for it.
- Relevant exceptions or constraints that justify another choice.
- An example or source pointer when it resolves a real ambiguity.

Name the actual code, API, or domain concept when the rule depends on it. A quality rule can address reading or maintenance cost without requiring a runtime defect. Avoid vague instructions such as "keep code clean" and absolute bans where the decision depends on context.

For example, a confirmed rule could require comparable authorization checks across related operations so reviewers can spot missing checks. That does not imply extracting a shared helper when the operations have different policies. Explain that distinction rather than writing only "be consistent."

Keep the rule in one authoritative home. Do not copy enforceable configuration or general agent instructions into the standards document. Link to an authoritative source when readers need it. Do not turn a scoped preference into a requirement for unrelated code or a repository-wide rewrite.

## 4. Maintain existing rules

Compare a rule with current requirements, APIs, and its original rationale before changing it. Clarify ambiguous conditions, combine duplicates, and revise deliberate trade-offs when their constraints change. Remove a rule when its obsolescence or duplication is established, not because one session ignored it.

Preserve unaffected decisions and scope. State when an edit changes policy rather than merely clarifying wording. Do not convert a standards-maintenance request into code cleanup or implementation.

## 5. Verify the result

Read the resulting document against the accepted decisions, actual code, and declared scope. Check examples, source pointers, local links, and the intended discovery location. Remove redundant prose and unrelated rules. Confirm that the file was not created if every candidate was already covered or belonged in a mechanical check.

Report the document changed, decisions recorded or revised, candidates left out and why, and unresolved choices. File and link checks do not prove that future reviewers will follow the guidance.
