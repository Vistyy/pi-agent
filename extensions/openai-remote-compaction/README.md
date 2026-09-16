# OpenAI Remote Compaction

This local Pi extension uses OpenAI Codex remote compaction for `openai-codex` subscription models, including Astra.
There is no per-model opt-in list.
Compaction compatibility hashes control checkpoint reuse, not whether remote compaction is enabled.
Other providers keep normal Pi behavior unless the active branch contains a remote checkpoint.

## Behavior

Pi owns compaction thresholds, scheduling, retained-tail selection, persistence, and continuation.
When Pi requests compaction, the extension builds a fresh Codex request from the current branch, model, system prompt, active tools, and reasoning level.
It authenticates with the Codex OAuth credential managed by Pi.
It stores OpenAI's opaque remote checkpoint in a normal Pi compaction entry instead of generating a second plaintext summary.
No completed provider request or in-memory request cache is required.

Compatible Codex models can continue the remote checkpoint chain.
The extension follows Codex model metadata and alias resolution for `comp_hash` compatibility.
A missing hash is unknown compatibility and does not block checkpoint reuse.
Only known differing hashes establish incompatibility.
Selecting a known-incompatible model warns that it will receive only the plaintext marker and visible tail.
Switching back to a compatible Codex model restores access to the remote checkpoint if no later compaction ended the chain.

If remote compaction fails, the extension leaves the session and remote checkpoint chain unchanged.
Use `/compact-pi` to confirm an ordinary Pi compaction that ends the remote checkpoint chain.
Custom `/compact` instructions are not supported while remote compaction applies.

Remote usage is stored in Pi's compaction entry, where Pi includes it in normal session usage totals.

## Documentation

- [Architecture](docs/architecture.md)
- [Decision records](docs/decisions/)
- [Domain terminology](CONTEXT.md)

## Validation

Run offline validation:

```sh
pnpm test
pnpm typecheck
```

Run live Codex validation explicitly:

```sh
PI_REMOTE_COMPACTION_LIVE=1 pnpm test:live
```

Set `PI_REMOTE_COMPACTION_MODEL` to choose the initial live model.
The live test uses the Codex OAuth credential from Pi's agent directory and consumes subscription usage.
