# Agent instruction verification

This repository is the first consumer of [Writ](https://github.com/Vistyy/writ), which owns the deterministic and semantic verification behavior for instructions agents act on.

## Setup

```sh
pnpm install --frozen-lockfile
```

## Commands

Run these from `instruction-lint/`:

```sh
pnpm check
TYPESAFE_API_KEY=... pnpm check:semantic
TYPESAFE_API_KEY=... pnpm check:references
TYPESAFE_API_KEY=... pnpm check:questions
```

- `pnpm check` is deterministic and offline.
- `check:semantic` validates skill-routing metadata.
- `check:references` validates instruction references and loading scope.
- `check:questions` calibrates Writ's semantic question contracts.

The three semantic commands are explicit, paid TypeSafe operations. Consult [Writ's documentation](https://github.com/Vistyy/writ#readme) for the exact scope, privacy boundary, advisory and fatal outcomes, receipts, and current limitations.
