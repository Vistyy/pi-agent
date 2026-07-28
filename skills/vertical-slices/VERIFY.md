# Verify an Implemented Slice

Read this reference only when checking whether an implemented Task satisfies its approved slice.
This reference owns task-level acceptance verification.
The `tdd` skill owns test construction and red-green cycles.

Trace every owned behavior through its applicable public seam.
Confirm one complete acceptance path through the primary seam.
Confirm behavior variations and external contracts through the cheapest reliable seams.

Read the repository development instructions to identify the supported gate.
The repository must pass that gate before the slice is complete.
If the Task owns an existing gate failure, record that failure as part of the approved starting condition.
A recorded starting failure does not change the final passing requirement.

Verification is complete when repository evidence demonstrates every owned behavior and the supported repository gate passes.
