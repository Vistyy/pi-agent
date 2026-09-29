# Poteto indicator

With PStack loaded, the existing `π` in the footer shows the saved mode for the current session branch. It uses the theme's accent color when enabled and its dim color otherwise. There is no additional label or toggle.

The footer reads the newest `pstack-mode` custom entry in the current branch on every render. Its data must contain `enabled` as a boolean. Missing or malformed data means off, matching PStack's current runtime. There is no separate cache or preference to synchronize.

`/poteto-mode on` and `/poteto-mode off` remain PStack's commands. The footer only reads their stored state. It does not enable workflows or change model instructions.

## Verification

From the Pi agent directory, run:

```sh
python3 extensions/statusline/tests/verify-poteto.py \
  --pstack /home/syzom/projects/pi-extensions/pi-pstack \
  --calm extensions/calm/index.ts \
  --theme themes/rose-pine-moon.json
```

Repeat with `--mode regular` for the regular terminal interface. `--calm` and `--theme` are optional.

The retained harness needs the installed Pi CLI, Python, and tmux. It uses a private agent directory, an owned tmux server, the real PStack commands, and a local Faux provider. It does not use paid models or modify the main session.

Checks cover actual rendered foreground colors, toggles, reloads, process restarts, tree navigation, fork inheritance, session switching, malformed data, unrelated entries, live theme changes, and narrow terminals. Evidence stays in the reported temporary directory. Test processes stop afterward.

This checks PStack's saved mode, not an agent's adherence to its instructions. If PStack changes its session-entry format, update this reader and rerun the native checks together.
