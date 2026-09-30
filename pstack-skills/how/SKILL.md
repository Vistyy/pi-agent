---
name: how
description: >-
  Use for "how does X work", code walkthroughs before changing something,
  and placement, ownership, or layering questions such as "where should this
  live" or "which package owns this". Also use before non-trivial changes or
  architectural decisions when the affected runtime flow, boundaries, or
  ownership are not yet understood from the current code. Explains subsystem
  architecture, runtime flow, and onboarding mental models. Not a historical
  design-rationale investigation.
---

# How

Explore the codebase to answer "how does X work?" questions. Produce architectural explanations at the level of a senior engineer onboarding onto a subsystem, enough to build a working mental model, not so much that it reads like annotated source code.

Explore and explain directly in the main agent. This is a read-only investigation; do not modify files or external state.

## 1. Assess complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple:** a single module, a small utility, or a narrow question such as "how does function X work". Explore and explain in a single pass.
- **Complex:** a subsystem spanning multiple files or services, a cross-cutting feature, or a full architectural overview. Decompose the question into 2 to 4 exploration angles, each a distinct slice of the subsystem. Trace these yourself, then combine the findings into one explanation.

When in doubt, take the simple path.

## 2. Explore

Gather facts. Trace code paths, read implementations, and map components. Use `bash` to find directories, files, and key symbols, and `read` to understand the actual implementation. Don't guess from names. Read the code.

1. **Find the entry point.** What triggers this behavior? A user action, an API call, a scheduled job? Find where it starts.
2. **Trace the flow.** Follow the call chain from the entry point. Read each function. Understand what data flows through and how it transforms.
3. **Map the key abstractions.** What types, interfaces, services, or classes are central? Read their definitions. Understand what they represent and why they exist.
4. **Find the boundaries.** Where does this subsystem interface with others? What goes in, what comes out?
5. **Look for the non-obvious.** Anything surprising? Anything that looks like a historical artifact? Anything a newcomer would misunderstand?

Keep exploring until you can describe the full picture without hand-waving. If you hit a part you can't trace, say so explicitly. "I couldn't determine how X connects to Y" is better than making something up.

Be factual and specific. Reference exact file paths, function names, type names, and line numbers where relevant.

## 3. Explain

Combine the findings into one coherent explanation. Merge overlapping descriptions and resolve contradictions by checking the code yourself. Read further to clarify a detail or fill a gap.

Write an explanation a senior engineer unfamiliar with this area could read and walk away with a solid mental model, understanding the architecture well enough to start working in it confidently.

Use this structure, adapted to what makes sense for the question. Not every section is needed for every question.

### Overview

1–2 paragraphs. What is this thing, what does it do, why does it exist? Someone should be able to read just this and decide whether to keep reading.

### Key Concepts

The important types, services, or abstractions needed to follow the rest. Brief definitions, not exhaustive.

### How It Works

Walk through the flow: what triggers it, what happens step by step, where data goes, and what the decision points are.

Use prose, not pseudocode. Reference specific files and functions so the reader knows where to look, but don't dump large code blocks unless a snippet is essential to a point.

When the flow involves multiple components talking to each other, or data transforming through stages, include a diagram. Use Mermaid for structured flows or ASCII art for simpler relationships. A diagram should clarify, not decorate. If prose covers the flow, skip the diagram.

### Where Things Live

A brief file/directory map. Just the ones someone would need to start working here.

### Gotchas

Non-obvious things, surprising behavior, historical context, pitfalls. Skip this section if there's nothing worth calling out.

## Communication

- Use concrete language, not abstractions-about-abstractions.
- Say "the `UserService` calls `AuthClient.refresh()`", not "the service delegates to the client".
- When something is complex, explain why it's complex. Don't just describe the complexity.
- When something is simple, don't pad it out.
- If there's a helpful analogy, use it. If there isn't, don't force one.
- Acknowledge open questions and gaps rather than hiding them.
