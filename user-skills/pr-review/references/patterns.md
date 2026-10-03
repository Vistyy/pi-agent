# Review patterns

Use the sections relevant to the changed behavior. Each concern needs an actual condition and consequence, not a smell label. These cues supplement the main review priorities and the linked principles.

## Changed logic and execution

In each changed logic area, trace a concrete input or state through the actual code to an independently justified result. Look for wrong values, labels, sets, or state on successful-return paths, not only crashes. Follow affected callers and downstream contracts across module and package boundaries.

For concurrency, retries, partial updates, restart behavior, or performance, establish the actual actors, shared mutable state, operation order, and workload. A hypothetical unused path is not a bug. A rare reachable path can be consequential. Prefer a correction proportionate to accepted behavior over speculative guards or new guarantees.

**Usability and accessibility.** For user-interface changes, check whether intended users can complete the affected workflow. Inspect changed interactions, error feedback, keyboard access, and assistive-technology behavior where relevant to the supported interface. Ground findings in actual product constraints, not an unrequested redesign.

## Tests and verification claims

Read [Test Behavior, Not Implementation](../../../pstack-principles/principle-test-behavior-not-implementation/SKILL.md). Identify the subject that actually ran, the observed result, and the independent contract supporting the expectation.

Look explicitly for tautological, self-confirming, or shared-oracle expectations, fixture-only observations, and private constant pins. Distinguish these failures.

**Source-only assertions.** Look for source-string/regex/AST snapshots presented as behavioral evidence. Literal expected strings and file reads can verify genuine public output, persisted state, protocol, or intentional byte/text contracts. Machine-consumed configuration needs its consumer or semantic interpretation, not arbitrary token checks.

**Vacuous coverage.** Check vacuous guards, zero exercised cases, and whether adversarial setup actually created the intended condition. Absence assertions need a working observation mechanism and positive control.

A mock at a production boundary can test a useful interaction but does not prove the real integration works. Verify integration claims through the supported path and actual integration. Report simulated, unavailable, and untested coverage honestly. Rejudge fixer-authored code and same-round tests against independent expectations. Passing together does not establish that either is right.

For prompt changes, inspecting the final delivered prompt can establish transport, not model adherence. Instructions are not runtime permission enforcement. Do not require live model calls in ordinary deterministic tests.

## Bug fixes and their revisions

Read [Fix Root Causes](../../../pstack-principles/principle-fix-root-causes/SKILL.md). State the violated invariant. Inspect equivalent axes, representations, sibling operations/transitions, and every consumed field involved in that invariant within the affected area. A matching grep is not proof that all manifestations are covered. Verify ordinary successful paths through each changed function and its affected callers as well as the reported failure. Prefer the same small correction or a supported shared boundary, not a new framework by default.

When revision history shows that prior repairs added unnecessary machinery and now create more defects, propose returning to the minimal compliant fix rather than layering further repairs. Do not assume every prior fix was unnecessary or perform an automatic rollback.

## Necessity and remedy scope

Read [Subtract Before You Add](../../../pstack-principles/principle-subtract-before-you-add/SKILL.md). Enumerate introduced acceptance paths, fallbacks, aliases, modes, options, and parallel rules. Identify the requirement each serves. Establish necessity from accepted behavior and supported usage, not complexity alone. Consider removing or narrowing an unrequired component before hardening it with validation, retries, state, or documentation.

**Scope expansion.** A genuine defect does not authorize every remedy. New durable state, schemas, background or continuous monitoring work, retry/persistence systems, threat models, or guarantees can expand scope. Labels such as "security", "correctness", or "fail closed" do not establish authorization. Show the smallest compliant alternative and its trade-off. A difficult correction required by accepted intent remains in scope. The human decides changes to supported behavior or unsettled intent.

## Design, ownership, and defaults

Use [Minimize Reader Load](../../../pstack-principles/principle-minimize-reader-load/SKILL.md), [Model the Domain](../../../pstack-principles/principle-model-the-domain/SKILL.md), and [Type System Discipline](../../../pstack-principles/principle-type-system-discipline/SKILL.md) where their conditions apply.

Inspect repeated shape checks and scattered state rules for a clearer domain structure. Do not force a registry, state machine, or framework when direct local code is already clear. Moving branches into another file does not remove their reading burden.

Question one-caller wrappers, pass-through layers, and premature abstractions by their actual benefit. A forwarding boundary can legitimately own adaptation or policy. Look up the appropriate canonical helper and owner before recommending a near-duplicate. Check whether feature-specific rules belong in the chosen shared module. Do not impose reuse where behaviors need different policies.

**Competing definitions.** Look for independently maintained definitions of the same concept or contract across code, schemas, and documentation, including data formats, state machines, and decision rules. Prefer one complete authoritative definition with references or derivations. Establish the actual disagreement or coordinated-change burden. Mirroring an authoritative generated definition is not an independent competing owner.

Inspect silent defaults, fallbacks, and casts that conceal a required invariant. Preserve intentional fallback behavior. Check the feasible alternative against actual framework APIs, pinned versions, and project constraints. Project standards can establish mandatory rules. Personal file-size or decomposition preferences alone do not.

## Protected operations and disclosures

When protected resources, operations, or data disclosures change, identify the actor, resource, operation, and permitted scope under actual project policy. A valid identifier, UI restriction, or prompt instruction is not authorization. Trace runtime enforcement through shared controls, reachable callers, and alternate entry points, including tool and destructive access where applicable. Name the reachable unauthorized effect. Missing middleware with a particular name is not evidence of missing protection. Accept equivalent shared controls. Once a boundary establishes and preserves authorized scope, internal functions need not repeat its checks.

Do not invent an access policy for intentionally public data or a new threat model. Name material newly introduced policy ambiguity without deciding the product rule yourself.

For privacy, trace protected fields and their recipients through primary responses and secondary search, cache, log, telemetry, error, export, and generated-artifact projections. Name the protected field, unauthorized recipient, and reachable disclosure. A safe primary response does not establish that secondary outputs are safe.

## Caches

Check every response-varying key input, including tenant, viewer, permissions, locale, and flags where applicable. Inspect freshness and invalidation, including permission changes. Distinguish origin errors from not-found results. Check memory bounds. Verify performance claims against the affected workload and measured cost. A cache changes result semantics and isolation as well as latency.

## Dependencies and developer workflows

Read pinned release and migration information and transitive lockfile changes. Semver and successful installation alone do not establish compatibility. Identify the actual installation boundary and inspect unfamiliar lifecycle scripts before execution. A review request does not authorize running an ordinary install to discover untrusted scripts.

Follow affected consumers and real integrations. Inspect changed secret sources, environment-variable names, ports, networking, run/build scripts, and feature gates. Check the resulting developer and runtime workflows, not only the local function or package. Keep unavailable integration verification explicit.

**Diagnosis and recovery.** When the change affects deployment, failure reporting, or service lifecycle, inspect whether failures can be detected and diagnosed. Check that supported restart, recovery, and rollback paths still work. Follow the existing deployment and support model. Do not demand a new monitoring system or recovery guarantee.
