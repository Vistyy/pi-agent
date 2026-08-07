# Fuzzy Files

This pi extension adds fuzzy file and directory completion to the prompt editor.

- Type `@query` to search only the current working directory and its subdirectories.
- Type `@@query` to search the broader file set: the current working directory, `~/.pi`, and each directory directly under `~/projects`.

The extension excludes `.git`, `node_modules`, `.next`, `dist`, `build`, `target`, `.venv`, and `vendor` directories from both searches.
