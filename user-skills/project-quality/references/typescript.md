# TypeScript implementation reference

Use this reference for TypeScript or JavaScript repositories.
Inspect the existing runtime, package manager, module system, framework, and tools first.
Keep each existing tool that satisfies the quality contract.
Use the tools below as supported defaults for missing outcomes.

## Outcome mapping

| Outcome | Supported default |
| --- | --- |
| Bootstrap | Pinned Node.js, pinned package manager, committed lockfile, and frozen install |
| Static correctness | TypeScript |
| Formatting and linting | Biome |
| Tests and coverage | Vitest with Istanbul when Fallow consumes coverage data |
| Dependency and code health | Fallow |
| Dependency architecture | Fallow boundaries or custom policies |
| Structural architecture and naming | ast-grep with rule fixtures |
| Configuration validation | Biome parsing, available schemas, and owning-tool validation |
| Local Markdown links and anchors | `remark-cli` with `remark-validate-links` |

## Just mapping

Pin Node.js and the package-manager version.
Set the applicable `engines` and `packageManager` fields in `package.json`.
Commit the lockfile.
Map applicable recipes to the selected tools:

```text
just bootstrap       -> <package-manager> install --frozen
just config-check    -> config parsing, schemas, and tool-native validation
just format          -> biome format --write
just format-check    -> biome format
just lint            -> biome lint
just typecheck       -> tsc --noEmit or the project typecheck configuration
just test [args]     -> vitest run [args]
just coverage [args] -> vitest run --coverage [args]
just fallow-check    -> applicable Fallow checks
just ast-grep-check  -> ast-grep rule tests and production scan
just docs-check      -> offline local Markdown-link validation
just build           -> production TypeScript or framework build
```

Verify every command and flag against the pinned tool version.

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

Choose `target`, `lib`, `module`, `moduleResolution`, environment types, and `skipLibCheck` from the deployed runtime and framework.
Use separate typecheck and build configurations only when emission requires them.

## Biome

Enable formatting and the recommended linter preset.
Enable applicable strict rules for explicit `any`, non-null assertions, barrel files, and production `console` use.
Include maintained source, test, script, documentation, JSON, and JSONC files.
Exclude dependencies, generated output, caches, coverage, and build artifacts.
Keep suppressions narrow and justified.
Use Biome naming rules when they express an approved naming contract.

## Vitest and coverage

Configure test discovery, environment, setup files, isolation, concurrency, timeouts, reporters, coverage provider, production files, and measured thresholds.
Use Istanbul when Fallow consumes `coverage-final.json`.
Verify that each untested production file appears as zero-covered.
Measure the repository before setting thresholds.

## Fallow

Configure actual production, test, script, worker, executable, and package-export entrypoints.
Align exclusions with TypeScript, Biome, Vitest, Git, packaging, and build tools.
Enable applicable checks for unused code and dependencies, unresolved imports, dependency classifications, duplicate exports, cycles, suppressions, duplication, complexity, and health.
Run development and production analyses when their graphs differ.
Use coverage data for CRAP scores.
Give each override an exact scope, current ceiling, and reason.

When an approved architecture contract exists, configure Fallow boundaries or policies.
Assign every governed production file to an intentional zone.

## ast-grep

Use ast-grep only when TypeScript, Biome, and Fallow cannot express an approved syntax, naming, or import-shape rule.
When custom rules exist, configure their rule and test directories in `sgconfig.yml`.
Each rule must include a stable ID, narrow scope, structural matcher, approved exceptions, and a diagnostic that names the supported form.
Add valid, invalid, bypass, and false-positive fixtures when applicable.
Run rule tests and a production scan through `just ast-grep-check`.
Demonstrate each diagnostic through a failing fixture or disposable violation.

## Configuration and documentation

Make `just config-check` validate each maintained configuration format and internal reference.
Use Biome for supported JSON and JSONC files.
Use available schemas and each owning tool's read-only validation.

When the repository maintains Markdown, use `remark-cli` with `remark-validate-links` when it supports the repository syntax.
Validate local files plus same-file and cross-file heading anchors offline.
Keep external URL availability outside the blocking gate.
Convert maintained navigational paths into local Markdown links.
