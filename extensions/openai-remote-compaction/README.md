# OpenAI Remote Compaction

This local Pi extension uses OpenAI Codex remote compaction for `openai-codex` subscription models.
Other providers keep normal Pi behavior unless the active branch contains a remote checkpoint.

## Behavior

The extension uses Pi's normal compaction triggers and `compaction.keepRecentTokens` setting.
It authenticates with the Codex OAuth credential managed by Pi.
It stores OpenAI's opaque remote checkpoint in the Pi session instead of generating a second plaintext summary.

Compatible Codex models can continue the remote checkpoint chain.
Compatibility requires a matching `comp_hash` from the official Codex model catalog.
An incompatible model receives the plaintext marker and visible tail after a warning.
Switching back to a compatible model restores access to the remote checkpoint if no later compaction ended the chain.

If remote compaction fails, the extension leaves the session and remote checkpoint chain unchanged.
Use `/compact-pi` to confirm an ordinary Pi compaction that ends the remote checkpoint chain.
Custom `/compact` instructions are not supported while remote compaction applies.

Remote usage is recorded in both Pi's compaction entry and the shared `pi.usage.recorded` format used by `/cost`.

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
