# TypeScript quality baseline

Adapt this reference to the project's runtime, framework, paths, and approved architecture.

## Tool responsibilities

| Tool | Responsibility |
| --- | --- |
| TypeScript | Language and type strictness |
| Biome | Formatting, linting, and supported configuration syntax |
| Vitest | Behavior tests and coverage |
| Fallow | Dead code, dependencies, cycles, duplication, suppressions, health, and optional import architecture |
| ast-grep | Optional structural syntax rules and rule fixtures |
| Just | Supported command surface |
| CI | Enforcement of the same Just gate |

Put each check in the tool that models it most directly.

## Required files

Use these files when applicable:

```text
AGENTS.md
justfile
package.json
<lockfile>
tsconfig.json
biome.json
vitest.config.ts
.fallowrc.jsonc
<CI workflow>
```

When corresponding custom Fallow or ast-grep rules and tests exist, add:

```text
fallow-rules/*.json
sgconfig.yml
ast-grep/rules/*.yml
ast-grep/tests/*-test.yml
```

Add build, workspace, or framework configuration when the project needs it.

## Just contract

Humans, agents, documentation, and CI must invoke Just recipes.
Recipes must invoke the selected package manager and tool binaries internally.

Provide each applicable recipe:

```text
just
just bootstrap
just config-check
just quality
just format
just format-check
just lint
just typecheck
just test [args]
just coverage [args]
just fallow-check
just build
```

When custom ast-grep rules exist, add `just ast-grep-check`.
The recipe must run rule tests and a production scan.
When packaging, generation, database, browser-test, audit, or release workflows exist, add named recipes.

`just quality` must compose every blocking check.
It may write ignored build or coverage artifacts.
It must leave tracked files unchanged.

Package lifecycle scripts must delegate to Just:

```json
{
  "scripts": {
    "prepack": "just build"
  }
}
```

Pin the runtime and package-manager versions.
Commit the lockfile.
Make `just bootstrap` perform a frozen install.
Before finalizing recipes, verify tool flags against the pinned versions.

## TypeScript contract

Use this strictness baseline:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "noPropertyAccessFromIndexSignature": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  }
}
```

Choose `target`, `lib`, `module`, `moduleResolution`, and environment types from the deployed runtime and framework.
Choose `skipLibCheck` deliberately.
When emission needs a narrower configuration, use separate typecheck and build recipes.

## Biome contract

Enable formatting and the recommended linter preset.
Define formatting conventions explicitly.

Use these strict rules when applicable:

- Explicit `any` is an error.
- Non-null assertions are errors.
- Barrel files are errors when direct imports improve dependency visibility.
- `console` is an error in production code when the project has a dedicated output mechanism.

Include supported source, test, script, documentation, JSON, and JSONC files.
Exclude generated output, dependencies, caches, coverage, and framework-generated directories.
Give every suppression the narrowest supported scope and a reason.

## Vitest and coverage contract

Configure explicit values for test paths, environment, setup files, isolation, concurrency, timeouts, coverage provider, production file set, reporters, and measured thresholds.

When Fallow consumes `coverage-final.json` for CRAP analysis, use Istanbul.
Verify that an untested production file appears as zero-covered instead of disappearing from the report.
Test observable behavior through public module interfaces.
Add integration or end-to-end coverage for the project's actual external contracts.

## Fallow contract

Configure real production, test, script, worker, executable, and package-export entrypoints.
Align exclusions with TypeScript, Biome, Vitest, Git, packaging, and build tools.

Enable applicable blocking checks for:

- Unused files, exports, types, members, and dependencies.
- Unresolved or unlisted imports.
- Dependency classification mistakes.
- Duplicate exports.
- Circular dependencies and re-export cycles.
- Stale or unexplained suppressions.
- Duplication.
- Complexity and health.

When normal and production graph findings differ, run both analyses.
Use coverage data for accurate CRAP scores.
Before setting health or complexity thresholds, measure the repository.
Give every accepted override an exact scope, current ceiling, and reason.

### Architecture checks

After the user approves the architecture, add Fallow boundaries or custom policies.
Use the project's modules, vocabulary, dependency directions, and exceptions.
Name the supported dependency path or seam in every Fallow diagnostic.
Assign every production file covered by an approved boundary scheme to an intentional zone.
Keep generic graph health in the shared baseline.
Keep project-specific zones and policies in the project configuration.

## ast-grep contract

Use ast-grep only when TypeScript, Biome, and Fallow cannot express a syntax or import-shape invariant clearly.
Before enforcing an architecture decision, obtain user approval.

Create `sgconfig.yml` only when custom ast-grep rules or rule tests exist:

```yaml
ruleDirs:
  - ast-grep/rules
testConfigs:
  - testDir: ast-grep/tests
```

Each rule must include:

- A stable ID.
- A source scope.
- A narrow structural matcher.
- Approved path exceptions.
- A diagnostic that names the supported path.
- Representative valid and invalid fixtures.
- Bypass and false-positive fixtures when relevant.

Put style rules in Biome.
Put dependency direction in Fallow.
Put runtime behavior in tests.

## CI and agent contract

CI must provision the pinned tools.
CI must call the same Just bootstrap and quality recipes used locally.
Workflow YAML must contain environment setup and Just invocations instead of duplicated tool commands.

Add this command contract to `AGENTS.md`:

```markdown
## Commands

Run `just` to list available recipes.

Use Just recipes for repository workflows.
Use `just quality` as the complete local quality gate.
```
