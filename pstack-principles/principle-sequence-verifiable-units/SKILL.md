---
name: principle-sequence-verifiable-units
description: "Apply to multi-step work (sweeps, migrations, runs of similar edits) and to how you stack commits and PRs. Break work into small units that each end in a verifiable state, check each before the next, and order delivery so the sequence proves itself to a reviewer."
---

# Sequence work into verifiable units

Order work as a sequence of small units, each ending in a state you can check, and don't advance until the current unit's intended outcome is verified.

**Why:** A break caught at the unit that caused it is cheap to localize. A break caught after a batch is buried, and you have already built further on a broken base. Sequencing those same units into a delivery a reviewer can replay turns "trust me" into "watch it go red, then green."

**Execution.** In a sweep, migration, or any run of similar edits, verify each change before starting the next. Each unit is a before/after bracket: verified starting baseline, one coherent change, run the check, then proceed. Rebase only when the agreed workflow requires it. When a lever does the edits, the per-unit check is nearly free. Run it anyway.

**Delivery.** Stack commits and PRs in the order that proves the work. The canonical shape is the failing test first, then the fix on top. Other story orders are a subtraction before the reshape, a baseline capture before the treatment, the scaffold before the feature. Verify each stage against its intended outcome: a deliberately red reproducer must fail for the intended bug, not a setup error; the fix must make the same check pass. Intermediate commits need not be independently merge-ready; the test and fix can land together. The sequence reads as an argument.

The sequencing complement to the [verification rules](../../AGENTS.md#verification), which keep each check real, and the **build-the-lever** principle skill, which makes the per-unit check cheap.
