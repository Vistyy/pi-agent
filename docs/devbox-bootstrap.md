# Devbox Bootstrap Notes

## Goal

Run pi from `devbox` and let remote pi finish workstation setup.

Flow:

```text
Mac local pi config
  -> pi-agent repo
    -> push
      -> clone on devbox
        -> install/symlink into ~/.pi/agent
          -> run pi remotely
```

## Current Pi Config To Ship

Tracked, non-secret files:

```text
AGENTS.md
settings.json
.gitignore
extensions/nofluff.ts
extensions/visual-aid.ts
extensions/web-search/      # optional if needed later
prompts/
skills/
themes/
```

Never commit:

```text
auth.json
sessions/
npm/
git/
node_modules/
*.log
.env*
*.pem
*.key
```

## Devbox First Commands

After pushing `pi-agent` and `home-server`:

```bash
ssh devbox
mkdir -p ~/.pi ~/projects
cd ~/projects
git clone <home-server-remote-url> home-server
git clone <pi-agent-remote-url> ~/.pi/agent
ln -s ~/.pi/agent ~/projects/pi-agent
```

Preferred shape: make `~/.pi/agent` the real Git worktree and make `~/projects/pi-agent` a convenience symlink.

Then authenticate pi provider on devbox if needed. Do not copy local `auth.json` unless explicitly intended.

## Let Remote Pi Continue

Start from devbox:

```bash
cd ~/projects/home-server
pi
```

Next remote-pi tasks:

1. verify pi runs with no-fluff + visual-aid extensions
2. add a tiny `pi-agent` install/sync script
3. decide project workspace layout under `~/work` or `~/projects`
4. add `.env`/non-Git file helper only after first real project proves shape
5. optional Btrfs snapshot workflow

## Known Devbox State

```text
SSH alias: devbox
Tailscale: 100.87.167.86
Btrfs root: yes
cmux browser: works
cmux image paste: works
nix shell nodejs_22: works
OpenTofu plan: clean
```
