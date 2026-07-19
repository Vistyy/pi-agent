# Design It Twice

Use this process when the user wants alternative interfaces for a selected deepening candidate.
Generate independent designs before you recommend one.

Use the vocabulary in [SKILL.md](SKILL.md): **module**, **interface**, **seam**, **adapter**, and **leverage**.

Produce at least three independent alternatives.
Prefer parallel child tasks with the `interface-designer` identity through `fork` or `subagent`.
If child tasks are unavailable, create each alternative in a separate note.
Give each alternative a different constraint.

## 1. Frame the problem

Describe the design problem without proposing a solution.
Include:

- The constraints that the interface must satisfy.
- The dependencies, classified with [DEEPENING.md](DEEPENING.md).
- A small code example that shows the problem.

Show the frame to the user.
Then continue while the user reads it.

This step is complete when the frame shows the design problem without showing a preferred solution.

## 2. Generate alternatives

Generate at least three independent `interface-designer` alternatives.
Run them in parallel when the tooling supports parallel work.

Include this information in each task:

- Relevant file paths.
- Coupling details.
- The dependency category from [DEEPENING.md](DEEPENING.md).
- The behavior behind the seam.
- Applicable `CONTEXT.md` terms, when a context file exists.
- One design constraint.

Use these default constraints:

1. Minimize the interface to one through three entry points.
2. Maximize flexibility for multiple use cases and extensions.
3. Make the common caller simple.
4. Use ports and adapters for cross-seam dependencies when applicable.

Require one concrete design from each task.
If a task returns multiple options, rerun it with a more precise constraint.

This step is complete when at least three independent alternatives satisfy different constraints.
Each alternative must contain:

1. An interface.
2. A usage example.
3. The behavior hidden behind the seam.
4. A dependency strategy.
5. Trade-offs.

## 3. Compare the alternatives

Present each design separately.
Compare the designs by **depth**, **locality**, and **seam placement**.
Recommend one design or one explicit hybrid.

This process is complete when the user has one recommended direction and the reason for that recommendation.
