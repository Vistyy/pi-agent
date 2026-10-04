# Code review

Use `/review` in the author pane to prepare an independent review across repositories and other files. The author uses its current conversation to identify scope and clarify ambiguity before launching one fresh reviewer in Herdr. The reviewer receives factual locations, captured revisions and relevant requirements. It does not receive the author's private conversation or review conclusions.

```text
/review
/review Check the payments and orders changes together, including shared config.
/review Compare the deployment commits and include ~/.config/service/settings.json.
/review cancel
/review resume
/review resume <review ID>
/review list
```

An empty `/review` asks the author to propose scope from the current work. Other text describes what you want reviewed. There is no repository or target picker. Discuss scope in the author conversation when clarification is needed. `/review cancel` ends preparation without launching. `/review resume` focuses or reopens the most recent linked reviewer. `/review list` selects a saved discussion.

A new reviewer opens without changing your focus. Explicit resume focuses the reviewer as soon as Herdr registers its process, without waiting for interactive startup to finish. Chat with it normally. Initial findings remain in that conversation. Run `/end-review` there to generate and return the complete updated report. The author then assesses the report against current code and the agreed scope. An idle author starts a response. A busy author receives native steering at a turn boundary, without aborting an in-flight tool. Return does not close either pane or grant permission to commit or publish.

## Scope contract

During preparation, the temporary `start_review` tool accepts a title, factual requirements and one or more locations:

```json
{
  "title": "Payments and orders contract",
  "requirements": ["Both services accept the same order identifier."],
  "locations": [
    { "kind": "changes", "repo": "services/payments", "paths": ["src", "tests"] },
    { "kind": "comparison", "repo": "services/orders", "base": "first-included^1", "head": "HEAD" },
    { "kind": "paths", "paths": ["config/shared.json", "/home/example/.config/service/settings.json"] }
  ]
}
```

Repositories and standalone paths are absolute or relative to the author working directory. A working directory outside Git is supported. Git path filters are relative to the resolved repository root. Paths containing spaces remain single JSON strings. Standalone files and folders need not belong to a repository.

`changes` captures the repository's HEAD and the union of selected staged, unstaged and untracked names. Deleted files, both sides of renames and cancelling staged/unstaged changes remain included. An empty working inventory is rejected. `comparison` resolves exact base/head commit trees and captures their changed files. It does not compute an implicit merge base. The author can resolve a merge base with its normal tools before submission. Comparisons can inspect another tree without changing or requiring a clean checkout. An empty comparison retains its accurate empty inventory. `paths` captures existing absolute files or folders, including unchanged integration context and files outside Git.

The extension does not fetch, switch the checkout or keep source snapshots. Comparisons use captured Git objects. Working changes and explicit paths use current source. Do not edit reviewed source during the pass. Resume restores the discussion, not old source. Start a new review after fixes.

PR metadata and scope selection belong to the author. It can inspect a PR with its existing tools and submit the resulting local tree comparison. There is no separate PR command or automatic GitHub operation.

## Temporary tool declarations

`start_review` is registered only after manual preparation, or when that preparation is restored from the active branch. It withdraws after the saved author link is created or preparation is cancelled. A failed pane startup retains the saved reviewer for `/review resume`; retrying the old launch call does not create another reviewer. Native sequential execution prevents duplicate launch calls from creating multiple saved reviews for the same preparation. Launch and resume share one in-progress opening per saved reviewer. Resume requests focus on that opening instead of creating another writer before Herdr registers the process.

The `context_with_system` hook edits only the outgoing request copy. It removes historical `start_review` declarations/removals and appends the authoritative declaration at the end while the tool is active. Ordinary leading tool definitions and saved conversation history stay unchanged. Calls and results remain in history. After withdrawal, subsequent requests do not declare the tool.

Preparation requires an author model with additional-tools and mid-conversation system-message support. Unrelated tool removals or redefinitions can prevent the native serializer from retaining this placement; preparation then reports an explicit error. There is no hidden request-file fallback. An explicit `--tools` or `defaultTools` loadout must permit `start_review`, and `--exclude-tools` must not exclude it. Compatible pending preparation survives reload. Unsupported preparation remains saved until you select a supported model or cancel it.

The live prototype on `openai-codex/gpt-6.1-sol` retained a warm long prefix through five repeated activations and withdrawals. A separate production-tool check completed three activation/launch/withdrawal cycles with 100 synthetic prior turns and 14 real author-model responses. Every activation retained its preceding control's 17,152 to 17,792 cached tokens. Activation added 580 uncached tokens in that probe, including its preparation request and larger schema. Withdrawals remained warm. The production cache probe used real two-repository capture and saved reviewer creation, but stubbed pane transport to avoid reviewer inference. The real Pi/Herdr harness verifies pane transport separately.

These measurements used thinking off and do not guarantee every model, extension configuration or cache lifetime. They report provider cache usage, not monetary billing. The deterministic serializer regression protects placement and prefix shape without paid requests.

## Reviewer resources and defaults

The reviewer has fresh history and normal configured resources. It uses reviewer defaults when configured, otherwise Pi's defaults. It does not copy the author's current model or thinking level. Normal tools remain available for owned temporary experiments. The review guide requires selected source to remain unchanged. This is not an operating-system sandbox.

Reviewer processes use Pi's native `--exclude-tools name_session,tuicr_review`. These tools remain available to the author. Their extensions stay loaded in the reviewer, including `/rename` and saved-state restoration hooks. No fresh reviewer inherits the author's naming or Tuicr state. Resuming an already live reviewer only focuses it. To apply the flags to a reviewer running before this change, close its pane and resume its saved discussion.

Set optional reviewer defaults in Pi's `settings.json`:

```json
{
  "codeReview": {
    "model": "openai-codex/gpt-6.1-sol",
    "thinkingLevel": "high"
  }
}
```

`model` requires a qualified provider/model reference. `thinkingLevel` accepts `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Omit either field to use Pi's normal default for that field. Pi clamps thinking to the selected model's capabilities. Settings apply to new reviews; resume preserves the saved selections.

Pi restores the seeded request as an existing conversation. When no thinking selection was saved, the internal `--review-initialize` flag applies native model-switch defaults once after startup selection. Reload and resume do not reapply that initialization.

## Ownership and recovery

- `index.ts` owns commands, temporary-tool preparation, request projection and Pi event integration.
- `scope.ts` owns scope schemas, location capture and the factual reviewer request.
- `sessions.ts` owns native identity, preparation, links and finalized report markers.
- `herdr.ts` owns pane creation and live reviewer discovery.

Native session files are the only durable store. The author's `code-review.link` references the exact reviewer session. The reviewer stores the author identity and launch anchor in `code-review.origin`. Scope belongs in its initial user message, not the routing identity. Additional fields in a current origin do not alter its routing identity. Session markers use the `code-review` namespace. Pre-rename markers are not recognized, and saved session files are not rewritten.

Reviewers are saved under `<author-session-directory>/reviewers/` so ordinary author `--continue` does not select a reviewer. Preparation belongs to the active author branch and is restored after reload. A link completes its preparation. Cancellation records the pending request's completion. Neither actor writes the other's live transcript. The launcher initializes a new reviewer before its process starts; only that reviewer writes it afterward.

Report delivery requires the original author identity and launch anchor on the active branch. In-memory pending identities prevent duplicate queueing. Identities stored in received messages prevent repeated delivery after reload or resume. The author validates findings rather than treating the report as authority.

Resume checks the saved origin and live process ownership, then focuses the existing writer or reopens the exact saved session. It does not fork history or continue an interrupted response. An interrupted finalization must be retried with `/end-review`. Tree navigation invalidates any restored pending finalization request. Additional user input during finalization also invalidates the attempt, so a discussion reply cannot become the final report. Closing a pane does not dispose the saved conversation. Closing during startup cancels the launcher's readiness wait and releases the review command. Success and failure both release the shared opening operation. You can resume the same saved discussion again.

## Review guidance

`instructions.md` is the canonical code-review guide. The extension loads the full guide into the reviewer's system context. The visible initial request contains only factual scope and requirements. A short "Start review." message starts the pass after the saved session opens. Shared review standards stay aligned with PR-review. See [Maintain the review guides](review-guidance/README.md) for the drift check.

## Verification

Run `pnpm test` and `pnpm typecheck` in this directory. Tests exercise actual Git repositories, native saved sessions, registered commands, temporary declarations, clarification, cancellation, reload, duplicate launch prevention and report assessment. The cache-shape test serializes native contexts through the actual Codex adapter with network transport blocked.

From the repository root, run `node extensions/code-review/tests/verify-herdr.mjs`. The harness starts an owned headless Herdr session with private HOME, XDG directories and sockets. It does not connect to your desktop session. It drives real Pi CLI panes with a controlled provider. Focus and zoom checks affect only the isolated test session. It verifies multi-location launch from a non-Git directory, canonical guide delivery, defaults independent of the author, native reviewer tool exclusions, focus, report return and automatic author assessment, saved and interrupted resume, author recovery and deduplication. It publishes a report while an owned controlled tool is executing, then verifies the successful tool result before author assessment. A pre-registration launch/resume overlap must produce one directly verified reviewer process with requested focus. It checks actual native files, the private socket inherited by each Pi process and live process IDs. It closes its test panes and stops only its owned server. Reload readiness requires a new startup marker and normalized terminal success output without the loading editor. Evidence remains in the printed temporary directory.

Controlled model responses prove transport and lifecycle, not model adherence or review quality. This harness does not infer against a real provider or inspect a live GitHub PR. Provider cache usage requires a separately authorized bounded live test.
