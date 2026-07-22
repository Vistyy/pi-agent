# OpenAI Remote Compaction

This context manages OpenAI Codex remote compaction inside Pi sessions.
It preserves OpenAI-native continuity while leaving ordinary Pi sessions unchanged.

## Language

**Remote compaction**:
The operation that asks OpenAI Codex to replace the current model context with a smaller OpenAI-native representation.
_Avoid_: Native compaction, encrypted compaction

**Remote checkpoint**:
The opaque encrypted history returned by remote compaction and stored in a Pi compaction entry.
_Avoid_: Remote compaction artifact, encrypted artifact, compaction blob

**Visible tail**:
The ordinary Pi messages after the latest remote checkpoint that remain directly readable by Pi and other models.
_Avoid_: Uncompacted context, recent context

**Remote checkpoint chain**:
The active sequence of remote checkpoints and visible tails that a compatible Codex model can continue.
_Avoid_: Encrypted session, remote session

**Compaction compatibility hash**:
The `comp_hash` value from OpenAI's Codex model catalog that identifies models which can directly reuse the same remote checkpoint.
_Avoid_: Model hash, checkpoint hash

**Compatible Codex model**:
An `openai-codex` model whose compaction compatibility hash matches the active remote checkpoint.
_Avoid_: Same model, compatible OpenAI model
