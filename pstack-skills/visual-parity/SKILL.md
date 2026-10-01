---
name: visual-parity
description: >-
  Use for appearance-preserving UI component migrations or pixel-exact matching
  to a known implementation. Establish stable screenshot baselines, protect
  comparison coverage, and verify each migrated component through image diffs.
  Not for visual redesign, prototype exploration, or behavior-only testing.
---

# Visual parity

**You own pixel-exact equivalence. The baseline is the spec. You do not touch it.** Equivalence is verified by image diff, not by eye.

1. Establish the baseline first, before any migration: a visual regression harness that screenshots the current component across its states, plus the target when matching two implementations. No baseline, no parity claim. A blocking prerequisite, not a follow-up. Reuse the repository's working capture/diff harness, or build and exercise one before changing components. Prove capture repeatability under the conditions below before freezing the baseline.
2. Freeze the baseline images and the harness's capture, coverage, and comparison criteria. Do not regenerate expected images from the migrated component, weaken coverage, or alter the comparison to obtain a pass. Legitimate output-preserving component restructuring is allowed. If the baseline or harness appears wrong, stop and surface the issue before changing the comparison contract.
3. Migrate one component at a time. Shared primitives migrate first as a blocking phase. Verify the affected component states before proceeding to dependents.
4. Verify each component against its baseline via image diff on the matching surface through the working capture/diff harness. Retain the baseline, actual capture, diff artifact, and measured result for each covered state. A nonzero diff is a fail. Investigate the pixel delta. Fix and recheck the component before proceeding; if capture instability or another blocker prevents a trustworthy result, report it rather than iterating indefinitely or claiming parity.
5. Run the affected behavior checks as well: equal screenshots prove appearance only for captured states, not functional equivalence. Commit or publish per component or safe batch only through the agreed workflow.

**Reply:** components migrated, the diff result for each, the baseline harness location, what's left.

## Capture conditions

Before migration, capture each relevant baseline state repeatedly and compare the actual images. A nonzero difference under unchanged inputs means the capture is not yet repeatable.

Hold viewport dimensions, display scale, renderer/browser version and platform, loaded fonts, data, component state, and animation/time conditions constant across baseline and migrated captures. Record these conditions with the state coverage. Resolve capture noise before attributing a difference to product code; do not silently increase tolerance to hide it.

For pixel-exact work, the required image delta is zero. A separately authorized tolerance is a different comparison criterion and must not be reported as pixel-exact equivalence. Report uncaptured states and blocked comparisons as unverified.
