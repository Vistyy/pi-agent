---
name: principle-fix-root-causes
description: "Apply when debugging or reviewing a bug fix. Trace each symptom to its root cause and fix it there; reproduce first, ask why until you reach it, resist nil-check guards that silence crashes."
---

# Fix Root Causes

When debugging, do not fix symptoms. Trace every problem to its root cause and fix it there.

**Why:** Symptom fixes accumulate. Each workaround makes the system harder to reason about, and the real bug remains. Root-cause fixes are slower upfront but reduce total debugging time.

**Pattern:**
- Reproduce first
- Ask "why" until you hit the root cause
- Do not add guards (adding a nil check to silence a crash is a symptom fix)
- If a workaround needs a paragraph-long comment to justify it, the code is wrong (fix the code, not the comment)
- State the violated invariant and reconstruct how actual inputs and state break it.
- Inspect semantically equivalent sites in the affected area: axes, representations, sibling operations or transitions, and every consumed input field involved in that invariant. Grep finds candidates. It does not establish complete coverage. Apply the same small correction or use an existing supported shared boundary, not a new framework by default.
- Verify the reported failure and ordinary successful paths through each changed function and its affected callers. Stay within accepted behavior. Do not expand a local fix into an unrequested repository-wide repair or new guarantee.
- When stuck, instrument. Don't guess (add logging, read the actual error)
- When runtime evidence refutes a hypothesis, remove the task-owned candidate fixes based on it. Do not keep speculative fixes without supporting evidence.

**Restart bugs: suspect state before code**

When something "fails after restart," suspect stale persistent state first: config files, caches, lock files, serialized state. If clearing a state file restores behavior, prioritize state validation as the fix.
