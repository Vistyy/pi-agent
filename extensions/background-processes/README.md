# Pi background processes

This private Pi extension runs commands that are explicitly documented as long-running without replacing foreground Bash.

## Agent tools

- `bg_run` starts a named command and returns immediately.
  It requires a short human-readable task name and the exact Bash command.
  Its optional execution timeout terminates the task with status `timed_out`.
- `bg_wait` waits for all selected tasks, or snapshots all currently running tasks when no IDs are supplied.
- `bg_status` inspects retained task state without waiting.
- `bg_logs` reads bounded captured output.
- `bg_kill` stops one task.

While tasks run, one line above the input shows their IDs and short names.
Use `/ps` to list more task details from the Pi interface.

An active `bg_wait` claims completion for its selected tasks.
A wait also claims a selected completion that became pending during the current parent turn.
An unclaimed completion queues a session message and wakes Pi when it is idle.
A wait timeout or cancellation does not stop the underlying task or lose its later completion notification.

## Scope

Tasks outlive turns but not Pi sessions.
At most eight tasks run concurrently, and the most recent 32 terminal task records remain inspectable.
Pi kills active tasks during session shutdown or extension reload.
The extension stores task state in memory and creates a private operating-system temporary output file only when output exceeds Pi's normal Bash display limits.
It does not create bookkeeping files in the project.
Commands still run with the user's operating-system permissions and can modify the project or other accessible files.

The extension does not provide a PTY, standard-input forwarding, readiness detection, persistence across sessions, or strict containment of descendants that deliberately escape their process group.
An escaped descendant that keeps the output pipe open can keep `bg_wait` waiting.
`bg_kill` returns an error if cancellation does not settle within five seconds, while the task remains inspectable and can still report its eventual terminal state.
