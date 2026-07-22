# OpenAI Remote Compaction

This local Pi extension uses OpenAI Codex remote compaction for `openai-codex` subscription models.
Other providers keep normal Pi behavior.

## Behavior

The extension uses Pi's normal compaction triggers and retained-tail setting.
It stores OpenAI's opaque remote checkpoint in the Pi session instead of generating a second plaintext summary.
Compatible Codex models can continue the remote checkpoint chain.

If remote compaction fails, the extension leaves the session unchanged.
Use `/compact-pi` to confirm an ordinary Pi compaction that ends the remote checkpoint chain.
Custom `/compact` instructions are not supported while remote compaction applies.

Remote usage is recorded in both Pi's compaction entry and the shared `pi.usage.recorded` format used by `/cost`.

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
