---
name: initialize-typescript-project
description: "[M] Initialize a TypeScript project with the shared quality tooling baseline."
disable-model-invocation: true
---

# Initialize a TypeScript Project

Create a strict quality baseline that matches the project's runtime, framework, paths, and approved architecture.
Use [QUALITY-BASELINE.md](QUALITY-BASELINE.md) for the tool contracts.

## Request

$ARGUMENTS

## 1. Inspect the repository

Read the repository instructions.
Record:

- The runtime, module system, framework, and package manager.
- Production, test, generated, build, fixture, and coverage paths.
- Current TypeScript, formatting, linting, testing, CI, and packaging configuration.
- Existing architecture documentation and dependency rules.
- Every existing quality command and its caller.

Preserve current project choices unless an approved baseline change requires a replacement.

This step is complete when every listed path, configuration, and command is accounted for.

## 2. Agree on architecture

Summarize the architecture documented or visible in the repository.
Ask the user to confirm:

- Module names and project vocabulary.
- Allowed dependency directions.
- Seams around external effects.
- Approved exceptions.
- Decisions that require automated enforcement.

Record the approved architecture in the repository before encoding an architecture rule.
The user can defer architecture enforcement while the shared quality tools are initialized.

This step is complete when the user approves the rules to encode or explicitly defers them.

## 3. Establish the Just interface

Pin the runtime, package manager, dependencies, and lockfile with the project's selected version mechanism.
Expose recurring repository operations as Just recipes.
Keep package-manager and tool commands inside the recipes.
Make required package lifecycle hooks call the corresponding Just recipe.

Provide each applicable standard recipe from the reference, including `just quality`.

This step is complete when `just` lists every recurring operation used by people, agents, documentation, and CI.

## 4. Configure shared quality checks

Configure:

- Strict TypeScript with runtime-specific module settings.
- Biome formatting and linting.
- Vitest test and coverage behavior.
- Fallow dead-code, dependency, cycle, duplication, suppression, and health checks.
- Configuration-file validation.

Measure the repository before setting coverage and health thresholds.
Align entrypoints and exclusions across the tools.

This step is complete when every shared quality recipe passes.
Each source, test, generated, and configuration path must have an explicit treatment.

## 5. Encode approved architecture checks

When step 2 approves architecture rules:

- Use Fallow boundaries and policies for dependency-graph rules.
- Use ast-grep for syntax or bypass rules that import analysis cannot express.
- Name the supported module or seam in each diagnostic.
- Add valid and invalid fixtures for each ast-grep rule.

Create `sgconfig.yml` when the project has custom ast-grep rules or rule tests.
When architecture enforcement is deferred, configure only the shared quality baseline.

This step is complete when each configured architecture rule maps to an approved decision.
Each custom rule must demonstrate its diagnostic through a fixture or disposable violation.

## 6. Verify the baseline

Configure `AGENTS.md`, project documentation, and CI to call Just recipes.
Run the complete gate in the pinned environment.
Run it from a clean checkout or disposable workspace.
Inspect Git status after the gate.

Resolve every formatting failure, lint finding, type error, test failure, configuration error, Fallow finding, and ast-grep finding.

The baseline is complete when bootstrap and quality recipes pass from a clean state.
CI must invoke the same recipes, and the gate must leave tracked files unchanged.
