---
status: accepted
---

# Preserve the remote chain on compaction failure

Remote compaction makes at most three total attempts for retryable failures and leaves the session unchanged when all attempts fail.
It does not silently fall back to Pi compaction because Pi cannot read earlier remote checkpoints and would produce an incomplete replacement history.

## Consequences

The user must retry remote compaction or explicitly run `/compact-pi`.
`/compact-pi` warns that older remote history will be unavailable before it ends the remote checkpoint chain.
