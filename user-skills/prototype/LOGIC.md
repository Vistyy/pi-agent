# Logic Prototype

Use a logic prototype to evaluate business logic, state transitions, data shapes, or an interface that requires manual exploration.
For a visual-design question, use [UI.md](UI.md).

## Applicable questions

Use this prototype to answer questions such as:

- Does the state machine handle a specified event sequence?
- Can the data model represent a specified case?
- Which interface makes the required state transitions clear?
- Which actions are valid in each state?

## 1. State the question

Before writing code, record the state model and one question that the prototype must answer.
Record the initial action set in the prototype README or at the top of the prototype file.

This step is complete when the state model, question, and initial actions are explicit.

## 2. Select the language and isolate the logic

Use the host project's language, runtime, package manager, and task runner.
If the project has no runtime, ask the user which runtime to use.

Select the structure that matches the domain behavior:

- **Pure reducer**: Use `(state, action) => state` for discrete events and one state value.
- **State machine**: Use explicit states and transitions when valid actions depend on the current state.
- **Pure functions**: Use functions over a plain data type when no current state is implicit.
- **Class or module**: Use a stateful interface when the logic owns persistent in-memory state.

Put the state model and transition logic behind a small pure interface.
Keep terminal I/O in the TUI shell.
Keep the logic module free of I/O, terminal code, and `console.log` control flow.
The TUI must import and call the logic module.
The logic module must not call the TUI.

This step is complete when callers can import and exercise the logic without terminal code.

## 3. Build the TUI

After each update, clear the terminal and render one complete frame.
Use `console.clear()`, `print("\033[2J\033[H")`, or the runtime equivalent.
Keep the complete frame visible on one screen.

Render these sections in order:

1. **Current state**: Show one field per line or formatted JSON.
   Use bold text for field names or section headings.
   Use dim text for secondary context.
   Native ANSI codes are sufficient: `\x1b[1m`, `\x1b[2m`, and `\x1b[0m`.
2. **Keyboard shortcuts**: Show each key and action, such as `[a] add user  [d] delete user  [t] tick clock  [q] quit`.

Implement this interaction loop:

1. Initialize one in-memory state value.
2. Render the initial frame.
3. Read one keystroke or line.
4. Dispatch the input to one action handler.
5. Render the complete frame again.
6. Repeat until the user selects quit.

This step is complete when every action replaces the frame, quit exits, and the frame fits on one screen.

## 4. Provide the run command

Add `pnpm run <prototype-name>` to the existing task runner.
If no task runner exists, put the exact command at the top of the prototype README.

This step is complete when the documented command starts the prototype from a clean checkout.

## 5. Hand off the prototype

Give the user the run command and current action list.
Let the user exercise the state model.
When the user needs another case to answer the question, add an action.

This step is complete when the user can run the prototype and exercise every current action.

## 6. Promote validated logic

After the parent process preserves the complete prototype on a throwaway branch, move the validated logic into the production module on the main branch.
Remove the TUI shell from the main branch.

This step is complete when the main branch contains the validated logic without the TUI shell.

## Guardrails

- Use the prototype for exploration without adding tests.
- If persistence is not the stated question, use in-memory state.
- Implement only behavior required to answer the stated question.
- Keep domain logic in the portable logic module.
- Keep the TUI shell on the throwaway branch and outside production code.
