# Reviewed result history

`history.jsonl` is the append-only source of reviewed behavioral checkpoints.
It does not contain one record per run.
Each line contains one independently interpretable checkpoint retained because it establishes a first model qualification, changes an accepted status, materially changes reliability, changes a conclusion after a suite or grader revision, or supports an explicit product decision.
Repeated runs that preserve the same accepted conclusion do not add history.

A checkpoint is eligible only when its cases and graders are accepted, every included trial has been adjudicated, and the record accurately limits its claim to the tested configuration.
Infrastructure smoke runs and runs with `pending_human` grades are not eligible.

Raw transcripts and trajectories remain under `../runs/` during evaluation and diagnosis.
They are ignored by Git and may be removed after their diagnostic or adjudication value ends.
The committed history preserves concise aggregate results and exact configuration identity without retaining every transcript.

A generated current-status matrix may be added after the first accepted checkpoint exists.
It must be derived from the latest applicable records in `history.jsonl` rather than edited independently.
