---
name: typescript-quality
description: Use when initializing a TypeScript project or adopting or upgrading Effect and shared compiler/lint configuration. Skip routine TypeScript edits and running existing checks.
---

# Effect and shared TypeScript quality configuration

Use Effect by default for new TypeScript projects. For existing projects, preserve the accepted runtime and architecture unless adopting Effect or changing the toolchain is part of the authorized work.
Follow documentation for the selected Effect version rather than mixing v3 examples with v4 APIs. Prefer upstream Effect diagnostics and documentation over a local substitute.

## Integrate the shared configuration

Use [`Vistyy/typescript-quality`](https://github.com/Vistyy/typescript-quality) as the shared configuration owner, rather than copying its rules into instructions or templates.
Before adoption or upgrade, inspect the project's current checks and read the package README at the selected revision for publication status, compatible TypeScript, Effect and tool versions, and exact installation and checking commands.
Pin the package and compatible toolchain so local checks and CI use the same policy. Templates establish the initial layout and configuration references, not another copy of the rules.

Keep runtime, framework, file-selection and exception settings project-local. Do not put one project's paths or assumptions into the shared baseline. Keep generated output under its generator's checks.
Avoid duplicate diagnostics from overlapping Biome, Oxlint and Effect integrations.

## Verify the integration

Use the same check command locally and in CI. Required checks must produce failing exit codes, not merely editor warnings; reserve non-blocking diagnostics for optional advice.
For a configuration change, run the actual checks to confirm that intended violations fail and a valid representative project passes.
