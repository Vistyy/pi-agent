# Design It Twice

Use this when the user wants alternative interfaces for a chosen deepening candidate.
The goal is diversity: generate several independent interface designs before recommending one.

Uses the vocabulary in [SKILL.md](SKILL.md): **module**, **interface**, **seam**, **adapter**, **leverage**.

Mechanic: run parallel `interface-designer` identities through the `subagent` tool.
Each identity gets a separate brief and one design constraint.

## Process

### 1. Frame the problem space

Write a user-facing frame, not a proposal:

- Constraints the new interface must satisfy
- Dependencies it would rely on, categorized using [DEEPENING.md](DEEPENING.md)
- A rough illustrative code sketch to ground the constraints

Completion: the user can see the design problem without seeing your preferred solution.

Show this to the user, then proceed while they read.

### 2. Generate alternatives

Run at least 3 parallel `interface-designer` tasks.

Each task brief includes:

- Relevant file paths
- Coupling details
- Dependency category from [DEEPENING.md](DEEPENING.md)
- What sits behind the seam
- Relevant CONTEXT.md vocabulary, if present
- One design constraint

Default constraints:

1. Minimize the interface: 1-3 entry points, maximum leverage per entry point.
2. Maximize flexibility: support many use cases and extension.
3. Optimize for the common caller: make the default case trivial.
4. Use ports and adapters for cross-seam dependencies, if applicable.

Completion: at least 3 returned alternatives, each with one concrete interface and all five sections:

1. Interface
2. Usage example
3. What hides behind the seam
4. Dependency strategy
5. Trade-offs

If an alternative returns a menu instead of one design, rerun it with a sharper constraint.

### 3. Compare and recommend

Present designs sequentially.
Then compare them by **depth**, **locality**, and **seam placement**.

Recommend one design or a hybrid.
Be opinionated.
Completion: the user has one preferred direction and the reason it beats the alternatives.
