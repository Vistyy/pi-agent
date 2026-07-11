---
name: initialize-typescript-project
description: "[M] Initialize a TypeScript project with the shared quality tooling baseline."
disable-model-invocation: true
---

# Initialize a TypeScript project

Set up a strict, project-adapted quality baseline.
Use [`QUALITY-BASELINE.md`](QUALITY-BASELINE.md) for tool configuration.

## Request

$ARGUMENTS

## 1. Inspect

Read the repository instructions and determine:

- runtime, module system, framework, and package manager
- production, test, generated, build, fixture, and coverage paths
- current TypeScript, formatting, linting, testing, CI, and packaging setup
- existing architecture documentation and dependency rules

Preserve existing project choices unless the quality baseline requires an explicit change.

**Complete when:** every relevant path and existing quality command is accounted for.

## 2. Agree on architecture

Summarize the architecture already documented or visible in the project.
Discuss with the user:

- the project's modules and vocabulary
- allowed dependency directions
- important seams around external effects
- approved exceptions
- which decisions should be enforced automatically

Record the agreed architecture in the repository before encoding it.
Architecture enforcement may be deferred while the shared quality tooling is initialized.

**Complete when:** the user has approved the architecture rules to encode now, or explicitly chosen to defer them.

## 3. Establish the Just command surface

Pin the runtime, package manager, dependencies, and lockfile through the project's chosen mechanism.
Expose recurring workflows through Just.
Package-manager and tool commands remain recipe implementation details.
Package lifecycle hooks delegate to Just where the ecosystem requires them.

Provide the applicable standard recipes from the reference, including `just quality`.

**Complete when:** `just` lists every recurring workflow used by humans, agents, documentation, and CI.

## 4. Configure shared quality checks

Configure:

- strict TypeScript with runtime-specific module settings
- Biome formatting and linting
- Vitest with explicit test and coverage settings
- Fallow dead-code, dependency, cycle, duplication, suppression, and health checks
- configuration-file validation

Choose measured coverage and health thresholds.
Align entrypoints and exclusions across all tools.

**Complete when:** every shared quality recipe passes and all source, test, generated, and configuration paths are handled intentionally.

## 5. Encode approved architecture checks

When architecture rules were approved in step 2:

- use Fallow boundaries and policies for dependency-graph rules
- use ast-grep for syntax patterns or bypasses that import rules cannot express
- name the supported module or seam in diagnostics
- add matcher fixtures for each ast-grep rule

Create `sgconfig.yml` only when the project has custom ast-grep rules or rule tests.
If architecture enforcement was deferred, omit project-specific boundaries and structural rules.

**Complete when:** every configured architecture rule maps to an approved decision and proves its diagnostic with a fixture or disposable violation.

## 6. Enforce and verify

Configure `AGENTS.md`, project documentation, and CI to use Just recipes.
Run the complete gate in the pinned environment and from a clean checkout or disposable workspace.
Inspect Git status after the gate.

Resolve every formatting failure, lint finding, type error, test failure, configuration error, Fallow finding, and ast-grep finding.

**Complete when:** bootstrap and quality recipes succeed from a clean state, CI invokes the same recipes, and the quality gate leaves tracked files unchanged.
