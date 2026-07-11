# TypeScript quality baseline

Adapt this baseline to the project's runtime, framework, paths, and approved architecture.

## Responsibilities

| Tool | Responsibility |
| --- | --- |
| TypeScript | Language and type strictness |
| Biome | Formatting, linting, and supported configuration syntax |
| Vitest | Behavior tests and coverage |
| Fallow | Dead code, dependencies, cycles, duplication, suppressions, health, and optional import architecture |
| ast-grep | Optional structural syntax rules and rule fixtures |
| Just | The supported command surface |
| CI | Enforcement of the same Just gate |

Put each check in the tool that models it most directly.

## Files

Common baseline files are:

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

Add these only when corresponding custom Fallow or ast-grep rules and tests exist:

```text
fallow-rules/*.json
sgconfig.yml
ast-grep/rules/*.yml
ast-grep/tests/*-test.yml
```

Use additional build, workspace, or framework configuration when the project needs it.

## Just contract

Humans, agents, documentation, and CI invoke Just recipes.
Recipes invoke the selected package manager and tool binaries internally.

Provide the applicable recipes:

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

Add `just ast-grep-check` when custom ast-grep rules exist.
Add named recipes for packaging, generation, databases, browser tests, audits, and releases when those workflows exist.

`just quality` composes every blocking check.
It may write ignored build or coverage artifacts, but it leaves tracked files unchanged.

Package lifecycle scripts delegate to Just:

```json
{
  "scripts": {
    "prepack": "just build"
  }
}
```

Pin the runtime and package-manager version.
Commit the lockfile and make `just bootstrap` perform a frozen install.
Verify tool flags against the pinned versions before finalizing recipes.

## TypeScript

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
Use separate typecheck and build recipes when emission needs a narrower configuration.

## Biome

Enable formatting and the recommended linter preset.
Define formatting conventions explicitly.

Useful strict rules include:

- explicit `any` is an error
- non-null assertions are errors
- barrel files are errors when direct imports improve dependency visibility
- `console` is an error in production code when the project has a dedicated output mechanism

Include supported source, tests, scripts, documentation, JSON, and JSONC files.
Exclude generated output, dependencies, caches, coverage, and framework-generated directories.

Give each suppression the narrowest supported scope and a reason.

## Vitest and coverage

Create explicit Vitest configuration for:

- test paths and environment
- setup files
- isolation, concurrency, and timeouts
- coverage provider and production file set
- reporters and measured thresholds

Use Istanbul coverage when Fallow consumes `coverage-final.json` for CRAP analysis.
Verify that an untested production file appears as zero-covered rather than disappearing from the report.

Test observable behavior through public module interfaces.
Add integration or end-to-end coverage for the external contracts the project actually has.

## Fallow

Configure real production, test, script, worker, executable, and package-export entrypoints.
Align exclusions with TypeScript, Biome, Vitest, Git, packaging, and build tools.

Enable applicable blocking checks for:

- unused files, exports, types, members, and dependencies
- unresolved or unlisted imports
- dependency classification mistakes
- duplicate exports
- circular dependencies and re-export cycles
- stale or unexplained suppressions
- duplication
- complexity and health

Run normal and production graph analysis when their findings differ.
Use coverage data for accurate CRAP scores.
Measure the repository before setting health or complexity thresholds.
Give accepted overrides an exact scope, current ceiling, and reason.

### Architecture checks

Fallow boundaries and custom policies encode dependency rules only after the user approves the project's architecture.
Use the project's own modules, vocabulary, dependency directions, and exceptions.

A Fallow rule diagnostic names the supported dependency path or seam.
Every production file covered by an approved boundary scheme belongs to an intentional zone.

Generic graph health is part of the shared baseline.
Project-specific zones and policies are not.

## ast-grep and `sgconfig.yml`

ast-grep is optional.
Use it when an invariant concerns syntax or an import shape that TypeScript, Biome, and Fallow cannot express clearly.
Obtain user approval first when that invariant enforces an architecture decision.

`sgconfig.yml` is ast-grep's project configuration file.
It tells the CLI where custom rules and their tests live, allowing `ast-grep scan` and `ast-grep test` to discover them:

```yaml
ruleDirs:
  - ast-grep/rules
testConfigs:
  - testDir: ast-grep/tests
```

Create it only when the project has custom ast-grep rules or rule tests.

Each rule includes:

- a stable ID and source scope
- a narrow structural matcher
- approved path exceptions
- a diagnostic naming the supported path
- representative valid and invalid fixtures
- bypass and false-positive fixtures where relevant

`just ast-grep-check` runs rule tests and a production scan.
Put style rules in Biome, dependency direction in Fallow, and runtime behavior in tests.

## Architecture discussion

Before adding Fallow boundaries, Fallow policies, or ast-grep rules, agree with the user on:

- the project's modules and names
- allowed dependencies
- important external-effect seams
- approved exceptions
- imports or syntax that would bypass those decisions
- the rules worth enforcing automatically

Record the agreement in project architecture documentation.
Encode only those approved rules.

## CI and agent guidance

CI provisions pinned tools, then calls the same Just bootstrap and quality recipes used locally.
Workflow YAML contains environment setup and Just invocations rather than duplicated tool commands.

Add this command contract to `AGENTS.md`:

```markdown
## Commands

Run `just` to list available recipes.

Use Just recipes for repository workflows.
Use `just quality` as the complete local quality gate.
```

The initialized baseline is complete when the clean-checkout bootstrap and quality recipes pass and Git reports no tracked changes afterward.
