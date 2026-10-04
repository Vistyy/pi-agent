---
name: show-me
description: Help the user understand the current topic through text-based diagrams, code-shape sketches, and custom visual or interactive explanations. Not for building and running prototype experiments to choose a design or behavior.
---

Help the user understand the current topic of conversation visually. Skip the preamble and keep prose brief. Pick the smallest view that makes the key point clear, with enough detail to explain the mechanism.

Choose the representation from the person's question and existing knowledge. Text-based diagrams and code blocks are first-class answers, not fallbacks. Keep the examples below available for direct use. A browser artifact is not automatically a better answer, and these examples are not a list of permitted formats.

Show how the relevant relationships produce the result, not just the names of the parts. Ground the explanation in the available evidence. Distinguish real behavior from a simulation, a simplification, or an inference. Keep the representation no more certain than its source.

- Show logic or an algorithm as pseudocode:

```text
on(save)
  if content is unchanged
    return cached result
  write new content
  return fresh result
```

- Show runtime control flow as a call tree:

```text
submitForm
  createSession
    persistPrompt
    launchAgent
  navigateToSession
```

- Show UI structure as a component tree, including state and module boundaries that matter:

```tsx
<SessionPage> (apps/example/src/routes/session.tsx)
  useSessionEvents()
  <SessionToolbar>
    <RunSkillButton> (packages/ui)
```

- Show file responsibility or a broad refactor as a shallow file tree:

```text
src/
├── commands/       # parses user actions
├── sessions/       # owns session state
└── transport/      # sends API requests
```

- Show component interaction, control flow, or data flow with Mermaid:

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant Daemon
    User->>UI: choose command
    UI->>Daemon: send expanded prompt
    Daemon-->>UI: stream result
```

- Use `diff` when the point is what changes and the surrounding shape already exists. Match the diff shape to the topic.

For a component change:

```diff
 <SessionPage>
   useSessionEvents()
   <SessionToolbar>
+    <RunSkillButton />
   <SessionTimeline>
+    <SkillResultCard />
```

For a file-layout change:

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

For a call-tree or call-stack change:

```diff
 submitForm
   createSession
     persistPrompt
+    expandSkillMention
     launchAgent
-  navigateToSession
+  navigateToSession
+    subscribeToEvents
```

For a state or control-flow change:

```diff
 on(save)
-  write content
+  if content is unchanged
+    return cached result
+  write new content
+  invalidate cache
```

- Show the whole block when most of it is new, when omitted context would hide ownership or order, or when the user needs a copyable target shape:

```ts
function expandSkill(command: string): string {
  const skillName = command.slice(1)
  return `use the ${skillName} skill`
}
```

- When a custom visual or interactive explanation helps the person understand the subject, read [Browser authoring](references/browser-authoring.md). It covers presentation quality, meaningful interaction, source fidelity, packaging, and browser verification. Use it when authoring a browser artifact, not for every text diagram or code sketch. Keep the explanation focused, but do not reduce its depth merely to fit a stock diagram or minimize implementation effort. Place the artifact outside product source unless the user requested a repository change. Keep local assets beside the HTML and use relative paths.

Serve it for the user through the installed Lavish integration:

```sh
lavish-axi path/to/show-me-{description}.html --no-open
```

Use the URL returned by the configured CLI and check that it serves the actual artifact. Local hosting needs no additional delivery service when the person opens it on the same machine. For a remote reviewer, use the configured remote-host rewrite rather than an agent-local localhost URL or a browser opened on the SSH host. Keep optional remote access separate from authoring; do not require Tailscale. If a reachable private link is unavailable, provide the file path and report that browser delivery is blocked. Do not use `lavish-axi share`, which publishes to a third-party service.

Follow the CLI's current feedback lifecycle. Keep `lavish-axi poll <html-file>` attached to this agent through the foreground or a supported completion-aware facility; do not claim monitoring without a live feedback path. Read returned feedback completely, resume a timed-out poll when appropriate, and do not reopen a user-ended review uninvited. End the review only when complete or requested.

### Guidance

Place each visual next to the short text it supports. Keep only the calls, files, props, states, and boundaries needed to answer the user's current question or the options to resolve the current discussion point.

You may use one of these, you may use several, it is unlikely you will use all of them. Use your judgement and don't overwhelm the user.
