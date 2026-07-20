---
name: prototype
description: "[M] Build a throwaway logic or UI prototype to answer one design question."
disable-model-invocation: true
---

# Prototype

A prototype is throwaway code that answers one explicit design question.
Choose its type from the question.

## Select the type

- For a logic or state-model question, read [LOGIC.md](LOGIC.md).
  Build a small terminal application that exercises difficult state transitions.
- For a visual-design question, read [UI.md](UI.md).
  Build several structurally different UI variants on one route.
  Make each variant selectable through a URL parameter and bottom switcher.

Determine the question from the request and surrounding code.
If the question is ambiguous and the user is available, ask which type they need.
If the user is unavailable, choose logic for a backend module and UI for a page or component.
Record the assumption with the prototype.

## Build the prototype

1. Mark the prototype clearly.
   Place it near the module or page under evaluation.
   Include `prototype` in its path or name.
   Follow the project's existing UI routing convention.
2. Provide one run command or URL.
   For logic, add one command to the existing task runner.
   For UI, provide the standard development command, route, and `?variant=` values.
3. Keep state local by default.
   If persistence is not the design question, use in-memory state.
   For persistence, use a scratch database or a local file named `PROTOTYPE - wipe me`.
4. Limit implementation to evaluation behavior.
   Add only the code required to run the prototype and observe its result.
   Add no production error handling, tests, or reusable abstractions.
5. Expose the complete relevant state.
   Render it after every logic action and UI variant change.
6. Preserve the primary source.
   After the prototype answers its question, commit the complete prototype to a throwaway branch.
   Record the branch and commit with the durable answer.
   Keep only the validated decision in the main branch.

## Complete the prototype

Record the question and answer in a commit message, ADR, implementation task, or `NOTES.md`.
Before removing prototype-only code from the main branch, preserve the complete prototype.
Record the throwaway branch name and prototype commit with the answer.
