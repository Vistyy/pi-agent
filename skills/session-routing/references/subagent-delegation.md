# Subagent Delegation

Read this reference after selecting delegated work.
The main session remains the holistic reasoning owner.
The subagent owns one bounded question or deliverable and its detailed working context.

## 1. Prepare the assignment

Assign one self-contained question or deliverable.
State the user outcome, accepted constraints, relevant decisions, and known starting anchors.
State the result that the main session needs.
Do not explore sources merely to prepare the assignment.

When the subagent may edit files, identify the owned deliverable and any known path constraints.
Give concurrent subagents disjoint scopes.
Pass the skills that match each assignment when the delegation interface supports skills.

Require a compact report containing the applicable information:

- the result or recommendation;
- exact source paths and relevant identifiers;
- material evidence and reasoning;
- files changed;
- verification performed and its result;
- unresolved questions, conflicts, or risks.

Require an orientation report to identify exact sources, relevant symbols, concise evidence, and unresolved gaps.
Do not request full file contents, exhaustive command output, or exploratory history.
Request them only when the main-session decision requires them.

This step is complete when the subagent has one bounded scope and a decision-ready response contract.

## 2. Coordinate the work

Let the subagent retain the detailed working context for its assigned scope.
Do not independently investigate or verify that scope while the subagent owns it.

Continue main-session reasoning or work with a disjoint working set when it does not depend on the delegated result.
When the next main-session action depends on the result, wait for the subagent.

Send follow-up work to the same subagent when it requires that subagent's existing working context.
Use a new subagent only when the new assignment has a separate working set.
An explicitly independent corroboration assignment can also use a new subagent.

This step is complete when each active scope has one owner.
The main session must not have imported a delegated working set.

## 3. Apply the report

Use the returned report as the evidence source for holistic reasoning.
Check that the report satisfies the requested response contract.

When a source-local gap can affect the requested result or main-session decision, ask the same subagent to resolve it.
Inspect an exact source in the main session only when the holistic decision requires it.
Inspection is also permitted to resolve conflicting evidence or apply the result.
Do not repeat the delegated exploration.

This step is complete when the main session can integrate the result.
It must not reconstruct the subagent's working context.
