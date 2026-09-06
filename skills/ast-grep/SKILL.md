---
name: ast-grep
description: Reference when choosing to use ast-grep for syntax-based lint rules, structural queries, or authorized rewrites. Not a required workflow for code search or routine edits.
---

# AST patterns and rules

`ast-grep` is available for syntax-tree search, YAML lint rules, and rewrites.
Choose `grep`, `rg`, `ast-grep`, or other tools according to the task; no particular code-search tool is required.
`ast-grep scan` can run project-defined syntax rules as a linter, but does not replace TypeScript type checking or become a required check merely because the tool is installed.
Use the full `ast-grep` command name rather than the potentially ambiguous `sg` alias.
Read the installed `run --help` or `scan --help` for supported flags.

Start with a pattern and a focused path, for example:

```sh
ast-grep run --lang typescript --pattern 'console.log($$$ARGS)' src
```

Single-quote patterns so the shell preserves metavariables: `$ARG` matches one node and `$$$ARGS` matches a sequence.
Use `--debug-query=cst` with an explicit language to inspect how a pattern is parsed.
For relational queries, use `scan --rule` or `scan --inline-rules` and consult the [official rule reference](https://ast-grep.github.io/reference/rule.html).
Set `stopBy: end` on `inside` or `has` when traversal through arbitrary ancestors or descendants is intended, rather than applying it indiscriminately.
Check a complex query against representative matching and nonmatching snippets with `--stdin` before drawing conclusions from repository-wide results.
Preview matches before an authorized rewrite; parsing structure does not establish type or runtime equivalence.
