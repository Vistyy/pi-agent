---
status: accepted
---

# Use remote checkpoints without continuous portable summaries

OpenAI Codex compaction stores an opaque remote checkpoint without generating a second plaintext LLM summary at every compaction.
This avoids repeatedly sending the full uncached context to another summarization request because the expected workflow primarily uses Codex models.

## Consequences

Pi stores a short plaintext marker as the compaction summary.
Incompatible models can use the visible tail but cannot read history contained only in the remote checkpoint.
Portable cross-provider handoff is deferred until real usage justifies its cost and complexity.
