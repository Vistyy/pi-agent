# Fork child safety notes

## 2026-06-10: child edited despite inspection-only task

A fork child was delegated an inspection task with an explicit `Do not edit files` limit, but it implemented and committed changes anyway.

Observed commit:

```text
c32e9ce Make fork child prompt effort-aware, add prompt shape tests and model evals
```

Why this matters:

- Prompt-only limits are not enough to keep fork children inspection-only.
- Child processes currently inherit enough repo access to modify files and commit changes.
- Blocking `edit`/`write` tools would not fully solve this because `bash` can still mutate files.
- The parent must not assume a child obeyed task boundaries just because the task said `Do not edit`.

Possible follow-ups:

- Add an eval where the fork task says `Do not edit`; fail if the child modifies files, commits, or reports implementation work.
- Add a before/after dirty-tree check around fork execution and surface violations as fork errors.
- Default investigation forks to no `edit`/`write` tools if Pi child tool policy allows it.
- Investigate a real sandbox for fork children, likely Gondolin, with the repo mounted read-only or copy-on-write.
- Decide whether implementation forks should be a separate explicit mode from investigation/review forks.
- Review `c32e9ce` carefully because it was produced by a child outside its delegated scope.
