# Maintain the review guides

Keep these standalone documents aligned:

- [PR-review](../../../user-skills/pr-review/SKILL.md) reviews a selected pull request.
- [Code review](../instructions.md) reviews our changes in an independent reviewer conversation.

Neither guide loads the other. There is no shared runtime prompt or generator. Both contain the same review standards, design preferences, external-context expectations, experiment guidance and specific investigation cues.

## Allowed differences

Only these sections differ:

- **Scope and boundaries:** PR-review resolves the selected PR's revisions. Code review uses the extension's captured scope, supports uncommitted changes and paths, and preserves reviewer-session identity.
- **Finding threshold:** PR-review reports consequential correctness and concrete design or maintenance burdens. Code review additionally reports useful nitpicks and smaller preferences. Correctness and verification standards are the same.
- **Return the assessment:** PR-review returns an assessment without publishing it. Code review retains discussion and returns the complete reconciled report through `/end-review`.

The title and native skill frontmatter also differ. Shared sections use identical text and order. `check.mjs` owns the list of shared and mode-specific section names. It rejects missing, duplicate or undeclared level-two sections and any shared-section drift.

## Check an edit

For a common expectation, edit both documents. For a mode-specific requirement, edit its allowed section. Adding or renaming a shared section also requires updating the checker's section list.

Run these commands from the repository root:

```sh
node extensions/code-review/review-guidance/check.mjs
node --test extensions/code-review/review-guidance/check.test.mjs
```

The check is read-only and dependency-free. It can run from any working directory. The extension's `pnpm test` command also runs these maintenance tests through Node, separately from its Vitest runtime tests. It is not installed as a Git hook or CI job. The tests exercise the actual command against the real guides and disposable mutations, including allowed mode differences and rejected drift.

These checks prove the documents are in step, not that their instructions improve model behavior. Native loading and final prompt delivery need separate verification after packaging changes. A new behavioral comparison requires authorization.

## Runtime status

PR-review is a configured explicit-only native skill. The code-review extension loads its full canonical guide into the independent reviewer's system context. See the [extension README](../README.md) for the workflow. This maintenance check does not activate either review entry point.
