# Design It Twice

Generate materially different designs before recommending one.

## 1. Frame the design problem

Describe the required behavior and constraints without proposing a structure.
Include current ownership, caller knowledge, dependencies, verification surface, and applicable domain terms or ADR constraints only when established and material to the decision.
State decision-blocking unknowns instead of inventing details.
Include a small caller example when it clarifies the problem.

This step is complete when the frame states the design problem without favoring a solution.

## 2. Generate independent designs

Produce at least two materially different designs supported by the frame.
Use separate child tasks when independent context will reduce anchoring.
Vary ownership, interface, or seam decisions only where the frame supports the variation.
Do not create alternatives that differ only in names or file placement.

For each design, state the structural decisions and consequences needed to compare it.
Cover ownership, caller knowledge, interfaces, seams, dependencies, migration, verification, and introduced complexity only when material and supported by the frame.
Mark decision-blocking unknowns instead of inventing details.

This step is complete when at least two designs make genuinely different structural decisions and satisfy the required constraints.

## 3. Compare the designs

Compare caller knowledge, locality, edit locations, new concepts, indirection, migration work, verification setup, and reversibility.
Recommend the simplest design that satisfies the constraints.
Recommend a hybrid only when its combined structure remains coherent and costs less than either complete design.

This process is complete when the user receives the independent designs, their concrete trade-offs, and one justified recommendation.
