---
name: prototype
description: "[M] Build a throwaway logic or UI prototype to answer one design question."
disable-model-invocation: true
---

# Prototype

A prototype is throwaway code that answers one explicit design question.
Select the prototype type from that question.

## Select a prototype type

- For a logic or state-model question, read [LOGIC.md](LOGIC.md).
  Build a small terminal application that exercises difficult state transitions.
- For a visual-design question, read [UI.md](UI.md).
  Build several structurally different UI variants on one route.
  Make each variant selectable through a URL parameter and bottom switcher.

Determine the question from the user's request and the surrounding code.
If the question remains ambiguous and the user is available, ask which prototype type they need.
If the user is unavailable, select logic for a backend module and UI for a page or component.
Record that assumption with the prototype.

## Apply these rules

1. **Mark the prototype clearly.**
   Place prototype code near the module or page that it evaluates.
   Include `prototype` in its path or name.
   Follow the project's existing routing convention for UI routes.

2. **Provide one run command or URL.**
   For a logic prototype, add one command to the existing task runner.
   For a UI prototype, provide the standard development command, route, and `?variant=` values.

3. **Keep state local by default.**
   Use in-memory state.
   If persistence is the design question, use a scratch database or a local file named `PROTOTYPE - wipe me`.

4. **Implement only evaluation behavior.**
   Add the code required to run the prototype and observe the result.
   Add no production error handling, tests, or reusable abstractions.

5. **Expose the complete relevant state.**
   Render it after every logic action and every UI variant change.

6. **Preserve the primary source.**
   After the prototype answers its question, commit the complete prototype to a throwaway branch.
   Record the branch and commit with the durable answer.
   Keep only the validated decision in the main branch.

## Complete the prototype

Record the question and answer in a commit message, ADR, implementation task, or `NOTES.md`.
Preserve the complete prototype before removing prototype-only code from the main branch.
Record the throwaway branch name and prototype commit with the answer.
