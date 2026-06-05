# pi-observational-memory

Local working copy of the observational memory Pi extension.

Status: vendored from upstream `pi-observational-memory` and prepared for local modification.

Goals:

- keep useful upstream mechanics: observer, reflector, dropper, ledger, recall, compaction hook
- support both additive memory and replacement compaction modes
- preserve exact coding-session details: commands, paths, numbers, errors, run results, decisions, rejected options
- keep the extension debuggable and evaluable through the local eval harness

Notes:

- Source was copied from the MIT-licensed upstream project by `elpapi42`.
- This local copy is intentionally not a standalone published package yet.
- Next changes should be small and benchmarked against clean Pi and upstream OM.
