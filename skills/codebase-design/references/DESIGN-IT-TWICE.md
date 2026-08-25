# Design It Twice

## 1. Frame the design problem

Describe the required behavior and constraints without proposing a structure.
Include current ownership, caller knowledge, dependencies, verification surface, and applicable domain terms or ADR constraints only when established and material to the decision.
State decision-blocking unknowns instead of inventing details.
Include a small caller example when it clarifies the problem.

Map every evidence area that could materially change the selection.
The parent must directly inspect the architecture spine: the entry point, one representative path, and each boundary that could change the conclusion.
When relevant context spans multiple independently inspectable areas and owned agents are available, assign non-overlapping evidence areas to separate agents while the parent investigates the architecture spine.
Use direct investigation when the relevant evidence is compact, but do not narrow inspection merely because the first viable design appears early.

This step is complete when the frame states the design problem without favoring a solution, every material evidence area is covered or reported as unresolved, and the parent understands the architecture spine directly.

## 2. Generate independent designs

Generate each candidate independently before comparing or combining candidates.
Produce the materially different designs supported by the frame.
Vary ownership, interface, or seam decisions only where the frame supports the variation.
Do not create alternatives that differ only in names or file placement.

When owned agents are available, send the same problem frame and comparison criteria to at least two agents before selecting a design.
Keep their work independent, do not disclose another agent's conclusions, and develop enough parent-owned understanding to judge their claims.
When delegation is unavailable, generate alternatives in separate passes without carrying a provisional selection into the later pass.

When the constraints support fewer than two credible designs, report that result and its evidence instead of inventing another design.
When owned agents are available, use their independent work to challenge that conclusion rather than treating the first investigation as sufficient.

For each design, state only the structural decisions and consequences material to comparison, such as ownership, caller knowledge, interfaces, seams, dependencies, migration, verification, and introduced complexity when supported by the frame.
Mark decision-blocking unknowns instead of inventing details.

This step is complete when the supported design set and any evidence limiting it are explicit and every required independent contribution is accounted for.

## 3. Compare the designs

Apply the main skill's comparison and selection criteria to the designs.
Integrate the independent results by identifying agreements, disagreements, omitted concerns, and differences in evidence quality.
Resolve material conflicts through direct inspection or report the remaining uncertainty.
Recommend a hybrid only when its combined structure remains coherent and costs less than either complete design.

This process is complete when the user receives the supported design set, its material trade-offs, the relevant independent findings, and a justified recommendation or conclusion that fewer than two credible designs exist.
