# Future work

Keep this file small.
Move stable design into extension docs or README files.

## OM status and telemetry

Improve only from dogfooding evidence.

Useful signals:

- pending reflection observations
- active reflection tokens vs budget
- maintainer skip or failure reason
- rewrite pressure and skip reason
- recent OM usage cost
- observer gaps or repeated no-tool failures

## Compact fork snapshots

`pi-fork` now supports OM-backed compact snapshots with `sessionSnapshot: "om-compact"` and `omCompactExtension`.
The parent session is not mutated.
The child does not need OM loaded to receive the compacted context.

Remaining work:

- compare full vs `om-compact` on long noisy sessions
- measure cost and latency by effort level
- test exact anchors, stale/current status, provenance, and buried user constraints
- decide whether fork children need recall access later

## Observer edge cases

Still worth watching:

- intentional initial backfill skip visibility
- per-run observer token caps after delayed updates
- retry/backoff for no-tool or invalid output loops
- persistent error visibility and manual recovery commands

## Visual session-state idea

`docs/visual-plan-note.md` remains parked product thinking.
Do not mix it with OM architecture unless that idea becomes active work.
