# Design It Twice

## 1. Frame the design problem

Describe the required behavior and constraints without proposing a structure.
Include current ownership, caller knowledge, dependencies, verification surface, and applicable domain terms or ADR constraints only when established and material to the decision.
State decision-blocking unknowns instead of inventing details.
Include a small caller example when it clarifies the problem.

This step is complete when the frame states the design problem without favoring a solution.

## 2. Generate independent designs

Produce the materially different designs supported by the frame.
When the constraints support fewer than two credible designs, report that result and its evidence instead of inventing another design.
Use separate child tasks when independent context will reduce anchoring.
Vary ownership, interface, or seam decisions only where the frame supports the variation.
Do not create alternatives that differ only in names or file placement.

For each design, state only the structural decisions and consequences material to comparison, such as ownership, caller knowledge, interfaces, seams, dependencies, migration, verification, and introduced complexity when supported by the frame.
Mark decision-blocking unknowns instead of inventing details.

This step is complete when the supported design set and any evidence limiting it are explicit.

## 3. Compare the designs

Apply the main skill's comparison and selection criteria to the designs.
Recommend a hybrid only when its combined structure remains coherent and costs less than either complete design.

This process is complete when the user receives the supported design set, its material trade-offs, and a justified recommendation or conclusion that no credible design exists.
