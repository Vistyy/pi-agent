# Source-control history and reviews

## What this source contains

Commit messages, patches, authors and dates; PR or merge-request descriptions, reviews and discussion; comments explaining constraints; ADRs, changelogs and release notes; tests added alongside a change; related files changed together; linked issue and incident identifiers.

## How to search deeply

Expand beyond the latest commit. Trace file history through renames, find when the relevant text or pattern appeared, inspect full patches, and identify earlier origins of copied patterns.

```bash
git blame -L <start>,<end> <file>
git log --follow --oneline -- <file>
git log --follow -p -- <file>
git log -S '<exact text>' -- <file>
git log -G '<pattern>' -- <file>
git show <commit>
git log <old>..<new> -p -- <file>
git log -1 --format=%B <commit>
```

Retrieve substantive review bodies, comments, linked issues, and related changes through the repository host's actual tools. For GitHub, use the available GitHub CLI workflow; a useful record includes:

```bash
gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,closingIssuesReferences,comments,reviews,files
```

Search in-repo ADRs, notes and tests around the target:

```bash
rg -l -i 'architecture.decision' --glob '*.md'
rg -n -C2 '(TODO|FIXME|HACK|XXX|NOTE)' <file>
rg -l '<symbol>' --glob '*test*'
```

Read linked records in full. Track product terms and incident IDs for other categories. Use the corresponding review tools on other repository hosts rather than assuming GitHub access.

## What strong evidence looks like

An explicit explanation of the problem or constraint; a review discussion comparing alternatives; a comment stating why a limit or workaround exists; a ticket or incident cited by the change. Tests and co-changed files can reveal the motivating edge case, but a test's existence alone is circumstantial evidence of intent.

## Common pitfalls

Squash merges can hide branch history; seek review records. Shallow checkouts and missing remotes limit the search. A vague commit message may conceal a behavior change, so inspect the patch. Copied patterns may originate much earlier. Bot updates and backports often carry little rationale; follow their substantive origin instead of treating them as authoritative. Code mechanics, names, and present-day plausibility do not prove intent.
