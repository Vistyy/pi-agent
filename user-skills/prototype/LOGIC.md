# Logic Prototype

A logic prototype is a small interactive terminal application for evaluating a state model.
Use it for business logic, state transitions, data shapes, or an interface that requires manual exploration.

## Applicable questions

Use this prototype for questions such as:

- Does the state machine handle a specified event sequence?
- Can the data model represent a specified case?
- Which interface makes the required state transitions clear?
- Which actions are valid in each state?

For a visual-design question, use [UI.md](UI.md).

## Process

### 1. State the question

Before you write code, record the state model and the one question that the prototype must answer.
Put this information in the prototype README or at the top of the prototype file.
Record the initial action set.

This step is complete when the state model, question, and initial actions are explicit.

### 2. Select the language and tooling

Use the host project's language and runtime.
If the project has no runtime, ask the user which runtime to use.
Use the project's package manager and task runner.

### 3. Isolate portable logic

Put the state model and transition logic behind a small pure interface.
Keep all terminal I/O in the TUI shell.
The TUI imports and calls the logic module.
The logic module must not call the TUI.

Select the structure that matches the question:

- **Pure reducer**: Use `(state, action) => state` for discrete events and one state value.
- **State machine**: Use explicit states and transitions when valid actions depend on the current state.
- **Pure functions**: Use functions over a plain data type when no current state is implicit.
- **Class or module**: Use a stateful interface when the logic owns persistent in-memory state.

Select the structure for the domain behavior rather than for terminal convenience.
Keep the logic free of I/O, terminal code, and `console.log` control flow.

When the prototype answers the question, commit the complete prototype to the throwaway branch.
Then move the validated logic into the production module on the main branch.
Remove the TUI shell from the main branch.

This step is complete when callers can import and exercise the logic without terminal code.

### 4. Build the TUI

On each update, clear the terminal and render one complete frame.
Use `console.clear()`, `print("\033[2J\033[H")`, or the runtime equivalent.
Keep the complete frame visible on one screen.

Render these sections in order:

1. **Current state**: Show one field per line or formatted JSON.
   Use bold text for field names or section headings.
   Use dim text for secondary context.
   Native ANSI codes are sufficient: `\x1b[1m`, `\x1b[2m`, and `\x1b[0m`.
2. **Keyboard shortcuts**: Show each key and action, such as `[a] add user  [d] delete user  [t] tick clock  [q] quit`.

Implement the interaction loop:

1. Initialize one in-memory state value.
2. Render the initial frame.
3. Read one keystroke or line.
4. Dispatch the input to one action handler.
5. Render the complete frame again.
6. Repeat until the user selects quit.

This step is complete when every action replaces the frame, quit exits, and the frame fits on one screen.

### 5. Provide one run command

Add a command to the existing task runner, such as `pnpm run <prototype-name>`.
If no task runner exists, put the exact command at the top of the prototype README.

This step is complete when the documented command starts the prototype from a clean checkout.

### 6. Hand off the prototype

Give the user the run command and current action list.
Let the user exercise the state model.
Add actions when the user needs another case to answer the stated question.

This step is complete when the user can run the prototype and exercise every current action.

### 7. Capture the answer and prototype

Ask the user what the prototype demonstrated.
Record the question and answer in a durable location.
Commit the complete prototype to a throwaway branch before removing the TUI shell from the main branch.
Record the branch name and prototype commit with the answer.

This process is complete when the main branch contains the validated logic and the durable answer points to the preserved prototype.

## Guardrails

- Use the prototype for exploration without adding tests.
- Use in-memory state unless persistence is the stated question.
- Implement only behavior required to answer the stated question.
- Keep domain logic in the portable logic module.
- Keep the TUI shell on the throwaway branch and outside production code.
