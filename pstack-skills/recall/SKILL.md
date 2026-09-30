---
name: recall
description: "Reconstruct your recent working context from your own chat history, live state, and the shared record (user reports, prior fixes, incidents), then hand back a tight current-state brief. Use for 'recall my work on X', 'catch me up', 'what have I been working on', 'where did I leave off', before starting or resuming work."
---

# Recall

**Before you start or resume work, you rebuild the user's recent working context and hand back a tight capsule of where things stand now and what to do next.**

Keep it tight and on-topic. Read only what the in-scope threads need, then stop.

Your context lives in two records. Your own chat history holds what you did and decided. The shared record holds everything that happened around the same code under other names: the symptoms users keep reporting, the fixes that shipped and got reverted, the errors still firing in prod. That second record is what the **why** skill searches, across source control, the issue tracker, chat and issue channels, long-form docs, and error tracking. A feature with a long bug tail keeps most of its story there, so don't reconstruct it from your transcripts alone.

Pi transcripts are JSONL files, normally at `~/.pi/agent/sessions/--<encoded-workspace>--/<timestamp>_<session-id>.jsonl`. Encode the workspace by dropping its leading path separator and replacing `/`, `\`, and `:` with `-`. Locate the actual storage using `PI_SESSION_FILE` and respect agent-directory and session-directory overrides; do not assume the default path when storage is configured elsewhere. `PI_SESSION_ID` and `PI_SESSION_FILE` identify the current chat to exclude. Check each file's `session` header `cwd` against the scoped workspace before reading message content. Do not follow fork or clone parent files into another project without permission.

Each line is a typed entry, not one chat message. Message entries store their role and content in `message`; `id` and `parentId` form a tree. Keep branches distinct and cite the session ID plus entry IDs for findings. Use message dates for the requested window; a copied history does not become recent because its file was just modified. Search conversation text and tool-call arguments, not system prompts or skill catalogs. Raw entries survive compaction and context edits, so summaries can orient the search but cannot prove what tools ran. Read JSONL without resuming, migrating, or modifying the session files.

1. Classify, then route. One specific prior chat to resume is Pi's `/resume` or `--session` flow, not this. Turning habits into a durable skill is a different task (`automate-me`). A human-readable summary of your work is a different task. Recall loads working context across recent chats before you act. If the user already gave you a full state capsule (paths, branch, the change), use it and skip the mining.
2. Lock the scope before searching. Pin the window ("recent" is a real range, default the last 7 days), the topic if named, and the workspace (default the active one. Never read another project's transcripts without being asked). State the scope back. Never quietly turn "all" into "recent N".
3. Search your chat history directly, serially. Order candidates by real modification time (`ls -t`) and never by UUID name, grep the topic first and then read only the matching chats and only their relevant regions, and skip the current chat plus obvious noise (subagent, eval, and test chats). Record the same schema, one block per chat: topic, the user's goal, decisions, open threads, struggles and corrections, and artifacts (PRs, tickets, branches), each citing the session ID and relevant entry IDs. For one or two chats, search directly without splitting the corpus. Keep raw transcripts on disk and take bounded extracts into context; this does not provide an independent perspective or isolate raw history from the main agent.
4. Sweep the shared record whenever the topic names a feature, file, subsystem, area, or bug. This is the default, not a judgment call, and "my work on X" does not exempt it. Use the [why](../why/SKILL.md) skill's source guides, but steer their question from "why was this built this way" to "what's the current state, what's been tried and didn't hold, and what are users still reporting". Reuse its per-source playbooks, search the accessible sources serially alongside the chat-history mining, and inherit its posture: cover each source directly, null results are findings, skip an unavailable integration and say so. Fold what comes back into the brief. Skip this step only for pure activity recall with no named target ("what did I do this week"), where your own history and live state are the entire answer.
5. Verify against live state. Take the PRs, branches, and tickets that the mining and the sweep surfaced and check them with `git` and `gh`. When the answer hinges on what an agent actually did (the tools it ran, files it read, errors it hit), read the full transcript, not just a trimmed local copy.
6. Write the brief to the contract below. Group by thread. Stay on the named topic.

## Output contract

Lead with the capsule, then the thread status, then the problems, then the next move. Deeper detail goes below or gets cut.

- **Capsule.** At most 5 bullets. What this work is and where it stands overall.
- **Threads.** One line each, prefixed with exactly one status tag: `[merged #N]`, `[open PR #N]`, `[in flight <branch>]`, `[verified, uncommitted]`, `[reverted #N]`, `[planned, not started]`, `[committed <sha>]`, `[unverified, uncommitted]`, or `[blocked <reason>]`. A thread with no tag is not done yet, so tag it.
- **Problems.** At most 5, the recurring ones. Include the symptoms users keep reporting and any fix that shipped and was reverted, so the next attempt starts where the last one failed.
- **Next move.** The single most useful next action, concrete.

An adjacent feature or ticket stays out unless it blocks this one. When the capsule and thread lines outgrow a screen, cut detail before you cut threads. Follow the shared prose policy, cite chat findings by session ID and entry IDs and shared-record findings by their source (PR #, ticket ID, chat permalink, error-tracker issue), and sanitize private context before any public output.

**Reply:** the brief, to the contract above.
