# Provider-Agnostic Checkpoints

Status: Open question.
This document is not current architecture.

The current extension supports remote checkpoints only for compatible `openai-codex` requests.
It does not create a provider-agnostic checkpoint or a portable plaintext summary.

A future provider-agnostic design would need a shadow context engine that can reconstruct each provider request without relying on provider-specific opaque history.
It would also need an explicit handoff format, persistence and branch semantics, token accounting, safe tool-call boundaries, repeated compaction, and failure behavior.

Pi 0.83 public hooks expose context usage, `before_provider_request`, and persisted custom entries.
Those hooks are sufficient for the current Codex-only inline slice, but they do not provide a provider-neutral checkpoint representation or a finalized request-independent context engine.

Do not treat this note as an implementation plan or as support for non-Codex providers.
