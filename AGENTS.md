# Agent instructions

## Communication

- GitHub username: `Vistyy`.
- Correct obvious speech-to-text substitutions; clarify only when ambiguity could change the work.
- Be concise. Keep copyable paths, commands, errors, and quotations accurate.
- Use the project's glossary (such as `GLOSSARY.md`), when available, to resolve domain terminology.

## Design and readability

- Prefer low lasting complexity over low implementation effort. Count production code, tests, fixtures, adapters, dependencies, and caller obligations; moving complexity is not removing it.
- Question whether responsibilities are necessary. Remove superseded paths and prefer standard platform or library capabilities when they simplify the whole system.
- Give rules and state clear owners; introduce abstractions for concrete needs, not speculative flexibility.
- Organize files by cohesive responsibility, not line counts. Read relevant symbols and sections before expanding the search.

## Delegated assignments

- Preserve settled decisions. Choose local mechanics within the stated discretion; do not silently redesign, expand scope, or infer requirements.
- Return conflicts or missing consequential decisions to the coordinator with supporting evidence. Distinguish observations, inferences, and unknowns.

## Scope and safety

- Investigation, discussion, review, and planning are read-only unless changes are authorized.
- Resolve decision-changing uncertainty with source evidence or focused observations; disclose missing or conflicting evidence.
- Suggestions, examples, and skill methods do not create requirements or approval gates. Follow explicit user instructions and applicable project constraints.
- Ask before committing or pushing unless authorized. Include only authorized changes; report whether work is uncommitted, committed but unpushed, or pushed, and why anything remains pending.
- Preserve changes you did not make. If they block the task, ask rather than reset, overwrite, or revert them.
- Change generator sources and regenerate outputs; do not hand-edit generated files.
- Before deleting, overwriting, stopping, or releasing a resource, verify its exact identity and ownership against the authorized scope.
- If a command errors or times out after possibly changing something, inspect what actually happened before retrying. Do not assume failure means nothing changed; retry directly only when repeating the operation is documented as safe.

## Verification

- When repository-specific verification guidance exists, use it to refine the applicable guarantees, evidence boundaries, and supported checks.
- Start from the affected promises and consequential ways they could fail. Choose evidence that distinguishes those failures from correct behavior, not a testing technique or test-count target.
- Make verification flow-first: exercise supported entry points and observe meaningful outcomes. Use the smallest real boundary that establishes the claim; green component tests do not establish that the application starts or a complete workflow works.
- Use implementation knowledge to select risky cases, but ground expectations in intended behavior and independently justified results. Do not reproduce production logic as its own oracle. Use targeted mutations when it is unclear whether a check detects the claimed failure.
- Assert forbidden effects and ordering where they matter, including mid-flight and at trust boundaries. Keep behavioral assertions stable across implementation changes; do not couple them to incidental wording, collection position, private structure, or helper calls.
- Evaluate the suite's overall approach, not just individual tests. Weak evidence or widespread fixture churn may call for different boundaries, fixtures, or a replacement harness—not more in-place rewrites. Existing test organization is not a requirement.
- Verify relevant quality characteristics with suitable evidence: measurements for performance or cost claims, design and caller inspection for complexity, and real interaction for usability or operational claims. Tests need not establish everything. Resolve consequential expectations and trade-offs rather than inventing requirements for every characteristic.
- Retain automated checks whose future protection justifies their total maintenance cost. Remove low-value tests and obsolete scaffolding when working in their area; use temporary probes for one-off uncertainty. Bound waits and clean up task-owned setup without removing unrelated resources.
- Match verification to the change: small, low-risk edits may need only inspection. Run required checks and verify affected behavior, not the whole product on every edit. State what the evidence establishes, what remains unverified, and why.
- Finish authorized work through verification and correction. Once applicable checks pass, broaden or repeat them only for new changes, failures, or specific unresolved concerns. Report blockers; ask again only for a material decision or scope expansion.
