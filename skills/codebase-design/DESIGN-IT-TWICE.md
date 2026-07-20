# Design It Twice

Use this process when the user requests independent interfaces or structural designs.
Generate materially different designs before recommending one.
Use the vocabulary in [SKILL.md](SKILL.md).

## 1. Frame the design problem

Describe the required behavior and constraints without proposing a structure.
Include the current ownership, caller knowledge, dependencies, test surface, and applicable domain terms or ADR constraints.
Include a small caller example when it clarifies the problem.

This step is complete when the frame states the design problem without favoring a solution.

## 2. Generate independent designs

Produce at least two materially different designs.
Use separate child tasks when independent context will reduce anchoring.
Give each design a different ownership, interface, or seam decision.
Do not create alternatives that differ only in names or file placement.

Each design must include:

- The module ownership.
- The interface and one representative caller.
- The behavior and knowledge hidden from callers.
- Each seam and its justification.
- The dependency and adapter strategy.
- The migration and test strategy.
- The complexity introduced by the design.

When a design deepens a module, apply [DEEPENING.md](DEEPENING.md) to that design.

This step is complete when at least two designs make genuinely different structural decisions and satisfy the required constraints.

## 3. Compare the designs

Compare caller knowledge, locality, edit locations, new concepts, indirection, migration work, test setup, and reversibility.
Recommend the simplest design that satisfies the constraints.
Recommend a hybrid only when its combined structure remains coherent and costs less than either complete design.

This process is complete when the user receives the independent designs, their concrete trade-offs, and one justified recommendation.
