# OpenAI Remote Compaction

This local Pi extension uses OpenAI Codex remote compaction for `openai-codex` subscription models.
Other providers keep normal Pi behavior unless the active branch contains a remote checkpoint.

## Behavior

The extension proactively compacts a compatible Codex request at or above 90% of Pi's reported context window before sending that request.
It rewrites that pending request with the returned remote checkpoint, so the active model and tool loop continues without a synthetic user message.
Pi's normal compaction triggers and `compaction.keepRecentTokens` setting remain supported.
It authenticates with the Codex OAuth credential managed by Pi.
It stores OpenAI's opaque remote checkpoint in the Pi session instead of generating a second plaintext summary.

Compatible Codex models can continue the remote checkpoint chain.
The extension follows Codex model metadata and alias resolution for `comp_hash` compatibility.
A missing hash is unknown compatibility and does not block checkpoint reuse.
Only known differing hashes establish incompatibility.
An incompatible model receives the plaintext marker and visible tail after a warning.
Switching back to a compatible model restores access to the remote checkpoint if no later compaction ended the chain.

If remote compaction fails, the extension leaves the session and remote checkpoint chain unchanged.
Use `/compact-pi` to confirm an ordinary Pi compaction that ends the remote checkpoint chain.
Custom `/compact` instructions are not supported while remote compaction applies.

Remote usage is recorded in both Pi's compaction entry and the shared `pi.usage.recorded` format used by `/cost`.
Inline checkpoints use a persisted custom entry and the same usage format.

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
