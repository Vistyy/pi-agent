# Wrap-up conversation audit

`/wrap-up` audits the complete raw active conversation path for discussion threads that have not reached conversational closure. It supplies evidence to the current agent; it does not decide whether the session can end.

## Audit flow

1. Capture the active path through the leaf present when the command starts.
2. Normalize the supported conversation content.
3. Send it through one direct, tool-free model request.
4. Record an inventory of discussion threads, explicit dispositions, and expected continuations.
5. Start a normal turn in the current Pi session so the existing agent can make the final determination.

The model request is not an agent loop and does not create a Pi session. The presentation turn retains normal tools for targeted read-only verification.

The audit does not:

- alter compaction;
- start another agent;
- inspect inactive `/tree` paths;
- continue implementation; or
- monitor work that already has an accepted owner and execution route.

## Closure rules

| Inventory label | Meaning |
| --- | --- |
| `expected revisit` | The matter is parked, promised as another phase, or otherwise remains an open loop. |
| `terminally excluded` | The user cancelled or excluded the matter with no expected continuation. |
| `accepted handoff` | Another owner has a supported execution route; no return is expected in this conversation. |
| `none expected` | The transcript supports no expected continuation. |
| `unclear` | The disposition is undetermined, not automatically open. |

Completing one phase does not close its parent topic while a promised child phase still expects a return.

## Coverage

The audit includes:

- visible user and assistant text;
- assistant error or abort endings; and
- displayed extension messages.

It excludes:

- thinking blocks;
- tool calls and tool-result bodies;
- shell output;
- images;
- hidden extension messages, skill-invocation scaffolding, and prior generated wrap-up reports;
- compaction entries, whose original messages remain available on the raw path; and
- inactive session-tree paths.

The inventory states these limits and cites session entry IDs for explicit transcript evidence. It uses the five disposition labels above.

## Model selection

Configure the audit model in `~/.pi/agent/settings.json`:

```json
{
  "wrap-up": {
    "model": "openai-codex/gpt-5.6-sol",
    "thinkingLevel": "high"
  }
}
```

| Field | Requirement |
| --- | --- |
| `model` | Pi `provider/model` form. Model IDs may contain additional slashes. The model must exist in Pi's registry and have configured authentication. |
| `thinkingLevel` | One of `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Passed to Pi as the nested completion's reasoning level. |

Both fields are required when the `wrap-up` section is present. Without that section, the command uses the current session's model and thinking level.

## Size and failure behavior

Before sending the request, the extension conservatively estimates the normalized transcript against the selected model's context window, output allowance, and a safety margin. If it does not fit, the command reports the limit instead of truncating history or claiming a complete audit.

A timed-out, errored, aborted, empty, or output-truncated request is not presented as a valid wrap-up.

The compact audit artifact remains in normal session context until later compaction. Subsequent audits exclude that artifact and its generated assistant report from their source transcript.

## Final ownership

The current agent owns the final classification. It may inspect current state read-only when the inventory identifies a concrete verification need.
