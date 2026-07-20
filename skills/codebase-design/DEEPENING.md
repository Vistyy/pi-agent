# Deepening

Use this guidance after the parent skill selects deepening as the simplest credible structure.
Use the parent skill's definitions of **module**, **interface**, **seam**, and **adapter**.

**Depth**: The behavior a caller or test can exercise for each part of the interface it must learn.
A deep module provides substantial behavior through a small interface.

**Leverage**: The capability callers receive for each part of the interface they must learn.
One implementation can provide leverage to many callers and tests.

## 1. Confirm the deepening hypothesis

Name the behavior, rules, invariants, or ordering currently distributed among callers.
Define the smaller interface that can replace that caller knowledge.
Compare the proposal with deletion, merging, moving behavior, and keeping direct code.

This step is complete when deepening reduces caller knowledge and verification cost enough to offset the new module and migration work.

## 2. Absorb the distributed behavior

Move the distributed rules, coordination, and invariants into the module.
Let callers provide required inputs and consume observable results.
Keep implementation ordering and dependency details inside the module.
Do not expose internal entry points only to preserve old callers or tests.
Use the supported interface and remove the replaced entry points after migration.

This step is complete when callers no longer coordinate the absorbed behavior.

## 3. Place dependency seams

Classify each dependency before creating a seam.

### In-process dependency

Keep pure computation and in-memory implementation inside the module.
Create no adapter unless the behavior has a concrete reason to vary.

### Local dependency with a test implementation

Use the production implementation in production and the faithful local implementation in tests.
Keep the seam private unless callers must select the implementation.

### Remote owned dependency

Place a seam at the transport when protocol, lifecycle, isolation, or replacement must vary independently.
Keep domain behavior in the module.
Use production and test adapters that satisfy the same interface.

### External dependency

Expose the project's required behavior instead of copying the vendor interface when isolation or replacement justifies a seam.
Keep direct use when one contained integration is simpler and sufficiently testable.

This step is complete when every seam has a named need and every adapter has a named environment or caller.

## 4. Migrate verification

Test externally observable behavior through the deepened module's interface.
Use focused implementation tests only when complex private behavior benefits from direct verification.
Delete or retarget tests for replaced modules and entry points.
A behavior-preserving internal refactor should not require changes to interface tests.

Deepening is complete when the interface tests cover the absorbed behavior and every replaced test is deleted or retargeted.
