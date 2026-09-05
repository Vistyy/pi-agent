---
name: typescript-quality
description: Use when initializing a TypeScript project or designing, adopting, or upgrading its compiler, lint, or Effect quality configuration. Skip routine TypeScript edits and running existing checks.
---

# TypeScript project quality

Use Effect by default for new TypeScript projects.
For existing projects, preserve their accepted runtime and architecture unless adopting Effect or changing the toolchain is part of the authorized work.
Follow documentation for the selected Effect version rather than mixing v3 examples with v4 APIs.
Prefer upstream Effect diagnostics and documentation over inventing another local methodology.

## Shared configuration and local ownership

Keep common rules in a separately versioned configuration package, not in global instructions or copied project templates.
Read the shared package's README at the selected revision before adoption or upgrade; it owns supported tool versions and exact installation and checking commands.
Pin the package and its compatible toolchain so local checks and CI use the same policy.
Use a template only to create the project's initial layout and configuration references.

Extend the shared configuration with project-local runtime, framework, file-selection, and exception settings.
Do not put one project's paths or framework assumptions into the universal baseline.
Keep generated output under its generator's checks rather than mechanically applying source-code refactors to it.

## Enforcement

Configure selected quality rules as blocking errors by default, with failing exit codes in local checks and CI.
Reserve non-blocking diagnostics for genuinely optional advice, not requirements that may be ignored.
Verify enforcement through the actual check command rather than relying on the severity displayed in an editor.
Avoid duplicate diagnostics from overlapping Biome, Oxlint, and Effect integrations.

Use the agreed cognitive-complexity ceiling of 15 as an error-level guardrail, not a target to minimize by scattering logic among trivial helpers.
Do not impose file-length limits; improve responsibility boundaries instead.

Strict anti-slop defaults may have narrowly scoped, explicit exceptions for legitimate boundaries.
For example, a decoder accepting external data may require an `unknown` parameter while internal operations should consume decoded types.
Explain the real boundary or invariant, not merely the need to satisfy lint.
Do not hide the same operation behind an alias or helper solely to evade a rule.
Repeated legitimate exceptions warrant reconsidering the rule's scope rather than automatic blanket suppression.

## Adoption

Inspect the project's existing checks and constraints before changing configuration.
Use the shared package's documented integration for the selected TypeScript and Effect versions; their native compiler and lint integrations have compatibility requirements.
Make the local check command the CI entry point as well.
For a configuration change, confirm that intended violations fail and a valid representative project passes.
Keep migration or cleanup focused on the adopted policy and preserve supported behavior.
