### Trace forensics

**You own the diagnosis from the artifact. Load it, shape it, narrow to the cause, attribute to source.**

Distinct from **Runtime forensics**, which instruments the live process. Here the capture already exists. The artifact is a fixed dataset, read it, don't re-run it. Keep tooling generic so the playbook stays portable: a DevTools or trace parser for cpuprofile and `.json.gz`, a text editor for a spindump, your heap tooling for a heapsnapshot.

1. Identify the format and load it with the right tool. Parse large artifacts with rerunnable local tools and retain the reduced finding alongside its evidence.
2. Transform the raw artifact into a form you can query. For large structured captures, a SQLite table with one row per sample, frame, or node is useful. Use direct inspection or a simpler parser when the artifact does not need that transformation. Reach the queryable shape before you read.
3. Narrow to the cause. Query for the frames that hold the most time and walk the call tree to the hot path. For a leak, follow the retainer chain from the leaked object to a GC root. For a spindump, find the thread stuck on-CPU or blocked and its wait reason.
4. Attribute to source. Map the hot frame to file, symbol, and line via the artifact's own symbols. A frame with no source mapping is not yet a diagnosis. Resolve the symbols, or say plainly the artifact does not carry them.
5. Compare against a paired capture when you have one. Diff a before and after artifact, accounting for workload and capture conditions. A difference strengthens the interpretation but does not by itself prove causality. Without corroborating evidence, mark the finding as the strongest hypothesis the artifact supports, not a confirmed cause.
6. Hand back a cited diagnosis, no fix unless asked. When a fix is requested, use the measured fix workflow once the cause is established.

**Reply:** the artifact and format, the reduced finding, the source location, the artifact paths, and what a paired capture or other corroborating evidence supports.
