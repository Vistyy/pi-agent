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

## Delegation

When coordinating:

- Offload evidence gathering and specified execution, not understanding, design, or acceptance. Involve the user in unresolved consequential choices, not routine handoffs.
- Make assignments independently judgeable: supply context, the exact question or intended result, scope, constraints, expected evidence, and worker discretion. Do not rely on unstated understanding or broad goals such as “simplify this.”
- Resolve consequential decisions before delegating implementation. Use focused research for missing facts, then interpret the findings and settle the approach; do not ask the implementer to discover what the change should be.
- Describe important relationships, preserved behavior, removals, and failure handling where relevant. Use task-appropriate diagrams, examples, or prose—not a mandatory code-shaped template or line-by-line prescription.
- Split independent questions, implementation slices, and review concerns; parallelize when useful. Avoid fixed worker counts and artificial fragmentation of coupled work.
- Request concise evidence with source references and explicit unknowns. Worker conclusions are claims to assess, not acceptance decisions; check consequential claims without repeating the entire investigation.

When executing a delegated assignment:

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

- Make verification flow-first: start from the supported entry point and check the observable outcome through real supported interfaces; green component tests do not establish that the application works.
- Assert forbidden effects and ordering where they matter, not just final state: what must never happen mid-flight and what must happen first at trust boundaries. Do not couple assertions to incidental wording or collection position unless that is the contract.
- Choose cases from the behavior's consequential failure modes and bound waits that could hang. Keep tests whose protection justifies their maintenance; judge confidence by consequential behavior, not counts. Use targeted mutations when it is unclear whether an assertion detects the claimed failure.
- Remove low-value tests and obsolete scaffolding when working in their area. Behavior-preserving refactors should ordinarily keep the suite green; widespread churn signals coupling to reconsider.
- Use temporary probes when sufficient; they need not become permanent tests. Clean up task-owned setup without removing unrelated resources.
- Match verification to the change: small, low-risk edits may need only inspection. Run required checks and verify affected behavior, not the whole product on every edit. Report what remains unverified and why.
- Finish authorized work through verification and correction. Once applicable checks pass, broaden or repeat them only for new changes, failures, or specific unresolved concerns. Report blockers; ask again only for a material decision or scope expansion.
