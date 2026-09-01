# Architecture

## Scope

The extension provides OpenAI Codex remote compaction for the `openai-codex` provider.
Other providers use Pi's normal compaction behavior unless the active branch contains an unreadable remote checkpoint.

## Ownership

Pi owns compaction scheduling, the context split, checkpoint persistence, retained-tail reconstruction, overflow retry, and continuation of the active agent run.
The extension owns remote checkpoint creation, Codex compatibility checks, and checkpoint injection into compatible provider requests.

```text
Pi selects prefix + retained tail
             |
             v
Extension remotely compacts prefix
             |
             v
Pi stores remote checkpoint + retained tail
             |
             v
Extension restores checkpoint for compatible Codex requests
```

## Context model

The active Codex context consists of one remote checkpoint followed by Pi's visible tail.

```text
remote checkpoint + visible tail
```

During repeated compaction, the extension sends the previous remote checkpoint followed by the new prefix selected by Pi.
It excludes the retained visible tail because Pi will append that tail after the new checkpoint.
This boundary prevents duplicated context.

The extension stores the opaque checkpoint under `details.openaiRemoteCheckpoint` on a normal Pi compaction entry.
Resume, reload, tree navigation, and session forks therefore use Pi's existing branch and persistence behavior.
Before a compatible Codex request, the extension replaces Pi's plaintext compaction marker with the stored checkpoint.

## Compatibility and failure

A Codex model can read a checkpoint when its known `comp_hash` matches the checkpoint's compatibility hash.
Unknown compatibility remains allowed, while a known mismatch leaves the plaintext marker and visible tail in place.
Compaction is blocked when the active model cannot read an existing remote checkpoint.

A remote-compaction failure does not alter the branch or replace the active checkpoint.
The extension retries only retryable failures and otherwise cancels that compaction attempt.
The `/compact-pi` command provides an explicit ordinary-compaction fallback that ends the remote checkpoint chain.
