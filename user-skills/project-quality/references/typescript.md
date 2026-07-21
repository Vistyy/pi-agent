# TypeScript implementation reference

Use this reference when a TypeScript or JavaScript project selects a corresponding quality outcome.
This reference explains tool configuration.
It does not require a project to adopt every listed tool or check.

Inspect the existing runtime, package manager, module system, framework, and tools before selecting configuration.
Preserve existing project decisions unless the user approves a quality-policy change.
Verify every command and option against the pinned tool version.

## Tool mapping

| Outcome | Applicable tool |
| --- | --- |
| Initialization | Pinned Node.js, pinned package manager, committed lockfile, and frozen install |
| Static correctness | TypeScript |
| Formatting and linting | Biome |
| Tests and coverage | Vitest with Istanbul when another selected tool consumes Istanbul coverage |
| Dependencies, dead code, and code health | Fallow |
| Dependency architecture | Fallow boundaries or policies |
| Exact syntax contracts | ast-grep with native rule fixtures |
| Local Markdown links and anchors | `remark-cli` with `remark-validate-links` |

Map selected tools to Just recipes.
Common mappings include:

```text
just init            -> <package-manager> install --frozen
just format          -> biome format --write
just format-check    -> biome format
just lint            -> biome lint
just typecheck       -> tsc --noEmit or the project typecheck configuration
just test [args]     -> vitest run [args]
just coverage [args] -> vitest run --coverage [args]
just fallow-check    -> selected blocking Fallow checks
just ast-grep-check  -> ast-grep rule tests and production scan
just docs-check      -> offline local Markdown-link validation
just build           -> production TypeScript or framework build
just health          -> selected advisory reports
```

## TypeScript

Select strictness options that match the runtime and accepted project policy.
Common strict options include:

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

Configure formatting and selected lint rules for maintained source, tests, scripts, documentation, JSON, and JSONC files.
Exclude dependencies, generated output, caches, coverage, and build artifacts.
Use Biome naming rules only when they express an approved syntax-level naming contract.
Semantic naming remains a review concern.

## Vitest and coverage

Configure test discovery, environment, setup files, isolation, concurrency, timeouts, reporters, production files, and selected thresholds.
Use Istanbul when a selected tool consumes `coverage-final.json`.
When the project measures all production code, verify that untested executable files appear at zero coverage.
Measure the repository before selecting thresholds.

## Fallow

Configure actual production, test, script, worker, executable, and package-export entrypoints.
Align generated-path exclusions with TypeScript, Biome, Vitest, Git, packaging, and build tools.
Enable only the dependency, dead-code, cycle, suppression, duplication, complexity, health, or architecture checks selected by the project.

A blocking Fallow command must return a failing status for its selected findings.
Keep a report advisory when Fallow cannot fail reliably for that report.
Use measured Istanbul coverage when the project uses CRAP.
Set direct complexity thresholds only through the approved project policy.

When an approved architecture contract exists, configure only the zones and policies needed to express that contract.
State explicitly which files receive no architecture claim.
Use Fallow for import and dependency structure, not semantic ownership or naming.

## ast-grep

Use ast-grep only for an approved syntax contract that TypeScript, Biome, and Fallow cannot express.
Each rule must have a stable ID, narrow scope, structural matcher, approved path exceptions, and native valid and invalid fixtures.
Run rule tests and a production scan through the applicable Just recipe.

ast-grep proves syntax matches only.
Use Fallow, TypeScript interfaces, behavior tests, or review when a contract depends on symbol identity, ownership, data flow, runtime behavior, or semantic naming.

## Documentation

When the repository maintains Markdown, use `remark-cli` with `remark-validate-links` when it supports the repository syntax.
Validate local files plus same-file and cross-file heading anchors offline.
Keep external URL availability outside the blocking gate.
Convert maintained navigational paths into local Markdown links.
