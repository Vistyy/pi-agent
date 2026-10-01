### Runtime forensics

**You own the diagnosis. Instrument the live process, don't theorize from source.** The deliverable is a cited diagnosis, not a fix.

1. Capture the live signal on the matching surface using the existing application harness or available profiling tools: a CPU profile for a spinning process, a heap snapshot for a leak, a CDP trace for a visual glitch. A real artifact, not a guess.
2. Reduce the artifact to the strongest diagnostic finding: the function on the hot path, the retainer chain from the leaked object to a GC root, the loop firing without input. Parse large artifacts with rerunnable local tools and retain the reduced finding alongside its evidence.
3. Test the suspected mechanism with runtime evidence. Inject instrumentation via CDP eval on the running process, or temporarily patch live code without reloading, to test the hypothesis cheaply. Record what changed, measure its effect, and restore the original behavior after the probe. Distinguish evidence of a contribution from proof of the full root cause; report an untested mechanism as a hypothesis.
4. Map the finding back to source: file, symbol, the line that allocates or schedules.
5. Record the observations and any temporary interventions, including how original behavior was restored.

**Reply:** the signal captured, the reduced finding, how you tested the mechanism and what the evidence supports, the source location, artifact paths. No permanent fix unless asked. When a fix is requested, use the measured fix workflow once the cause is established.
