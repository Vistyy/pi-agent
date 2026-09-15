# Wrap-up conversation audit

`/wrap-up` audits the complete raw active conversation path for discussion threads that never received a clear disposition.

The command extracts visible user and assistant text, assistant error/abort endings, and displayed extension messages from the session, excluding thinking and operational tool payloads. It sends that normalized transcript through one direct, tool-free model request. This request is not an agent loop and does not create a Pi session. The model inventories discussion threads and explicit transcript dispositions without deciding the final session state.

The extension then triggers a normal turn in the current Pi session. That existing agent retains its normal tools so it can perform targeted read-only verification where needed and make the final wrap-up determination. The audit does not alter compaction, start another agent, inspect inactive `/tree` paths, continue implementation, or monitor work that already has an accepted owner and execution route.

## Model selection

Configure the audit model in the global `~/.pi/agent/settings.json`:

```json
{
  "wrap-up": {
    "model": "openai-codex/gpt-5.6-sol",
    "thinkingLevel": "high"
  }
}
```

Both fields are required when the `wrap-up` section is present. `model` uses Pi's `provider/model` form; model IDs may themselves contain additional slashes. `thinkingLevel` accepts `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` and is passed to Pi as the nested completion's reasoning level. Without the section, the command uses the current session model and thinking level. The selected model must exist in Pi's model registry and have configured authentication.

## Size and failure behavior

The command performs a single audit completion. Before sending it, the extension conservatively estimates the normalized transcript size against the selected model's context window, output allowance, and a safety margin. If it does not fit, the command reports the limit and does not truncate history or claim a complete audit.

A timed-out, errored, aborted, empty, or output-truncated audit is not presented as a valid wrap-up.

The compact audit artifact used for the presentation turn remains in normal session context until later compaction, like other extension messages. Subsequent audits exclude both that artifact and its generated assistant report from their source transcript.

## Coverage

The audit includes visible text from standard user and assistant messages, assistant error/abort endings, and displayed extension messages on the active session path through the leaf captured when the command starts. It excludes:

- thinking blocks;
- tool calls and tool-result bodies;
- shell output;
- images;
- hidden extension messages, skill-invocation scaffolding, and prior generated wrap-up reports;
- compaction entries, whose original messages remain available on the raw path;
- inactive session-tree paths.

The inventory states these limitations and cites session entry IDs for explicit transcript evidence. Absence of explicit closure is reported as undetermined rather than declared open. The main agent owns final classification and may inspect current state read-only when the inventory identifies a concrete verification need.
