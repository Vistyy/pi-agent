# Maintained Evaluation Suites

## Retain useful protection

Build a suite only when repeated evaluation will protect accepted behavior or answer a recurring decision at justified cost.
Start from realistic tasks and observed failures rather than an arbitrary coverage target.
Each case needs an accepted behavior, a plausible important failure, and evidence that distinguishes valid from invalid results.
Use existing case families when they already cover the same independently observable failure.

Separate exploratory cases from release gates.
A gate needs a sufficiently stable requirement, fixture, grader, and configuration for failure to carry decision significance.
Keep examples used to tune a prompt or calibrate a judge separate from held-out cases when generalization is part of the claim.
Review generated cases before treating them as authoritative requirements or release criteria.

## Maintain the right boundary

Protect behavior rather than requiring the current skill, prompt, tool sequence, or harness unless that mechanism is itself required.
When replacing an implementation, retain relevant behavioral cases without preserving obsolete machinery.
Use ordinary deterministic checks for loading and execution mechanics; behavioral trials answer questions those checks cannot establish.

Run relevant retained cases when a change can affect their behavior.
Choose broader or repeated runs when the supported configuration, decision, or observed variability warrants them.
Do not make every edit trigger every expensive suite.
Version material case, grader, and configuration changes so prior results remain interpretable.

## Keep the suite honest

Verify that cases accept valid approaches and reject realistic invalid outcomes.
Use known-good and known-bad examples where they provide the cheapest decisive check; do not mandate historical reconstruction or ablations for every case.
Inspect unexpected failures before changing either the product or grader.
Do not change product instructions and case expectations together merely to obtain a pass.
An accepted requirement change can justify revising a case; a current model's failure alone cannot.

Remove or consolidate cases whose evidence no longer justifies their cost.
Retire stale fixtures, duplicated protection, and cases for unsupported behavior.
Do not drop the last meaningful protection for a required behavior merely because its original implementation disappeared.
Retain historical results only where needed to interpret baselines or decisions.
