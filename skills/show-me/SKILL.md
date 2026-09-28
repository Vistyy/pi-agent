---
name: show-me
description: Choose the smallest useful visual for structure, flow, layout, or interactive behavior. Use when the user asks to see a UI, try a prototype, or inspect a visual relationship that prose would obscure. Skip long reports and explanations that remain clear in Pi.
---

# Show Me

Help the user understand the current topic visually. Pick the smallest view that makes the key point clear.

## Choose a form

| Question shape | Prefer |
| --- | --- |
| Logic or algorithm | Pseudocode |
| Runtime control flow | Call tree |
| UI composition | Component tree |
| File responsibility or broad refactor | Shallow file tree |
| Component interaction, control flow, or data movement | Mermaid |
| Change to an existing shape | Fenced `diff` |
| Mostly new, copyable code | Complete code block |
| Rendered UI, visual fidelity, or behavior the reader must try | Focused HTML artifact |

## Logic and flow

Show an algorithm as pseudocode:

```text
on(save)
  if content is unchanged
    return cached result
  write new content
  return fresh result
```

Show runtime control flow as a call tree:

```text
submitForm
  createSession
    persistPrompt
    launchAgent
  navigateToSession
```

Show component interaction, control flow, or data flow with Mermaid:

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant Daemon
    User->>UI: choose command
    UI->>Daemon: send expanded prompt
    Daemon-->>UI: stream result
```

## Structure

Show UI composition as a component tree. Include only state and module boundaries that matter:

```tsx
<SessionPage> (apps/example/src/routes/session.tsx)
  useSessionEvents()
  <SessionToolbar>
    <RunSkillButton /> (packages/ui)
  <SessionTimeline>
```

Show file responsibility or a broad refactor as a shallow file tree:

```text
src/
├── commands/       # parses user actions
├── sessions/       # owns session state
└── transport/      # sends API requests
```

## Changes

Use a fenced `diff` when the surrounding shape already exists. Match the diff to the topic.

Component change:

```diff
 <SessionPage>
   <SessionToolbar>
+    <RunSkillButton />
   <SessionTimeline>
+    <SkillResultCard />
```

File-layout change:

```diff
 src/
 ├── commands/
+│   └── show-me.ts       # expands the slash command
 ├── sessions/
-└── transport.ts
+└── transport/
+    ├── client.ts
+    └── stream.ts
```

Call-tree or call-stack change:

```diff
 submitForm
   createSession
     persistPrompt
+    expandSkillMention
     launchAgent
-  navigateToSession
+  navigateToSession
+    subscribeEvents
```

State or control-flow change:

```diff
 on(save)
-  write content
+  if content is unchanged
+    return cached result
+  write content
+  invalidate cache
```

## New code

Show the complete block when most of it is new, omitted context would hide ownership or order, or the user needs a copyable target:

```ts
function expandSkill(command: string): string {
  const skillName = command.slice(1)
  return `use the ${skillName} skill`
}
```

## HTML artifacts

Use HTML only when the user must judge a rendered layout or try behavior that Pi cannot show. A long overview, plan, or comparison stays in Pi when text or a diagram preserves its meaning. Write one focused HTML file for the browser question.

- Match the product's colors, type, spacing, components, labels, and data. Support desktop and mobile.
- Place the artifact outside product source unless the user requested a repository change.
- On this devbox, use Lavish through the tailnet-only Tailscale Serve port 4387. Bind Lavish to `127.0.0.1`. Set `LAVISH_AXI_LINK_HOST` and `LAVISH_AXI_ALLOWED_HOSTS` to the devbox Tailscale DNS name and `LAVISH_AXI_NO_OPEN=1`. Run `lavish-axi <file> --no-open`, then confirm the returned URL serves the artifact before giving it to the user.
- A link does not open a browser on the user's SSH client. Keep the Lavish poll attached to this session for browser feedback, and end the review when finished. Do not use `lavish-axi share`, which sends the file to a third-party service.
- If a private browser link is unavailable, give the user the file path and say that it was not opened.

## Constraints

- Place each visual next to the text it supports.
- Keep only the calls, files, props, states, and boundaries needed for the current question or the options that resolve the current discussion point.
- Choose the visual forms that fit the question.
