# Codex Web GPT headless prototype

This is an isolated, browser-only staging route for the upstream
[`miuuyy/codex-chatgpt-web`](https://github.com/miuuyy/codex-chatgpt-web) Linux launcher. It starts a
private virtual display and exposes noVNC only on loopback so a human can sign in through an SSH
tunnel. It deliberately stops automation at the ChatGPT login boundary.

## Pin and inspected route

- Upstream release: `v5.0.4`
- Upstream commit: `c648c09501bb1b704c7ad5273fb5f5d6b8992dd2`
- Asset: `codex-web-gpt-5.0.4-linux-x64.AppImage`
- Published and pinned SHA-256:
  `53b2bda3691774fa588ae3f9b0fcdeea49b35e72966934631d172cac0adf0d76`
- Inspection found no upstream `AGENTS.md`. The release's `scripts/install-launcher.sh`, packaged
  AppImage runner, launcher profile resolution, login ownership, and core setup path were inspected
  at the pinned commit.

The upstream launcher is the supported Linux route. The older terminal-managed Chrome setup rejects
non-macOS hosts. The packaged launcher embeds Electron, Bun, the Responses bridge, and its browser;
its bounded runner extracts the AppImage when FUSE is unavailable. No sandbox bypass is used.

`install.sh` independently downloads the versioned asset and `checksums.txt`, requires the manifest
hash and local hash to match the pin, then extracts the upstream runner. It does not run the upstream
installer, create desktop files, or launch anything.

## Isolation and external state

The default external root is:

```text
~/.local/share/codex-web-gpt-headless/
├── app/                 # verified AppImage, upstream runner, checksum manifest
├── state/
│   ├── core/            # codex-chatgpt-web runtime/config
│   ├── codex-home/      # isolated Codex configuration target
│   ├── launcher/        # sensitive Electron profile and ChatGPT session
│   ├── vnc.passwd       # x11vnc password hash
│   ├── vnc-password.txt # generated VNC password, mode 0600
│   └── xdg/             # isolated config/data/cache (including any launcher autostart entry)
├── runtime/             # PID records and private XDG runtime data
├── logs/                # launcher/display logs
└── PROVENANCE
```

The scripts set `CODEX_CHATGPT_WEB_HOME`, `CODEX_HOME`,
`CODEX_WEB_GPT_LAUNCHER_DATA_DIR`, and all relevant XDG homes under that root. Existing
`~/.codex`, Pi, Workgraph, browser profiles, and listeners are not reused or changed. The launcher
may open a random loopback CDP endpoint for its own broker, as required by upstream; it is never
bound publicly. Treat `state/launcher` as an authentication secret and never copy or commit it.

Nix supplies `xorg-server`, `x11vnc`, and `novnc` user-locally. On NixOS, the AppImage's Electron
binary also needs standard GUI libraries that are not visible through a plain `nix shell`. The
start script resolves those libraries from the configured `<nixpkgs>` and passes `LD_LIBRARY_PATH`
only to the private session; it does not enable `nix-ld` or alter system configuration. The
verification environment resolved `<nixpkgs>` to
`/nix/store/5nkggxpr2qy7v4z4b7x2056a4wsgrgy3-source` (`26.05pre-git`). Defaults are display `:97`,
VNC `127.0.0.1:5905`, and noVNC `127.0.0.1:6085`. Startup refuses occupied ports or displays.
Overrides are `CODEX_WEB_GPT_HEADLESS_ROOT`, `CODEX_WEB_GPT_DISPLAY_NUMBER`,
`CODEX_WEB_GPT_VNC_PORT`, and `CODEX_WEB_GPT_NOVNC_PORT`; use the same values for every lifecycle
command.

## Install and start

From the retained checkout (not a temporary worker worktree):

```sh
cd ~/.pi/agent/scripts/codex-web-gpt-headless
```

These are standalone shell scripts, not Pi extensions. Keep them under `scripts/`, never
`~/.pi/agent/tools/`, which Pi reserves for legacy custom tools. Start the runtime from this
retained path so its supervisor identity and launcher restart callback survive worker cleanup.


```sh
./install.sh
./start.sh
./status.sh
```

`start.sh` prints the tunnel command and URLs. From a trusted client machine, substitute the SSH
host and user:

```sh
ssh -N -L 6085:127.0.0.1:6085 USER@HOST
```

Then open:

```text
http://127.0.0.1:6085/vnc.html?autoconnect=1&resize=scale
```

Read the generated VNC password on the server (do not paste it into chat or logs):

```sh
cat ~/.local/share/codex-web-gpt-headless/state/vnc-password.txt
```

Proceed only through the launcher's onboarding and **Sign in to ChatGPT** step. Login and identity
provider windows remain in the launcher's embedded, dedicated Electron profile. Do not send a
ChatGPT message, install the full MCP harness, or select **Install models** during this staging
step.

## Stop and restart

```sh
./stop.sh
./status.sh
./start.sh
```

The session supervisor records its PID and Linux process start time. `stop.sh` validates both the
identity and script command line before signaling only that supervisor; after a short grace period
it terminates only the supervisor's captured process tree if a shell is still waiting on Electron.
It does not kill unrelated processes. Login state survives in `state/launcher`.

## After human login

When the human has confirmed the embedded browser is signed in, the isolated browser-only bridge
can be initialized later:

1. Restart this private session if needed and reconnect through the SSH tunnel.
2. In the launcher, run its browser smoke test.
3. Choose browser-only/automatic mode and press **Install models**.
4. Keep **MCP** and tunnel setup disabled. Restart only a Codex process explicitly launched with
   `CODEX_HOME=~/.local/share/codex-web-gpt-headless/state/codex-home`.
5. Run the launcher's doctor and inspect its Activity logs before any model request.

Those steps initialize only the isolated Codex home and loopback Responses bridge. Integrating the
user's real Codex installation would require separate authorization and migration planning.

Verified on this dev box after authorized human login: the launcher's High smoke test passed,
Pro was detected, models were installed only in the isolated Codex home, and a direct
`chatgpt-web/pro` Responses/SSE request completed through `consult.py`. The bridge reported no
active turns afterward. No full MCP harness, normal Codex integration, or Pi model registration
was enabled. The response identifies the bridge route, not an independently attested underlying
OpenAI model version. Real advisory quality and full end-to-end Codex operation remain untested.

## Context-only consultation prototype

Prepare one UTF-8 file containing the question, constraints, relevant local code/diffs/logs, and
known gaps. Uncommitted file contents can be included; no push is needed. Do not include secrets.
Then run:

```sh
python3 ~/.pi/agent/scripts/codex-web-gpt-headless/consult.py /path/to/prompt.md \\
  --output ~/.local/share/codex-web-gpt-headless/consultations/unique-question-name
```

The output directory must not already exist. The client uses only the configured loopback
browser-only bridge and the fixed `chatgpt-web/pro` route. It supplies a fresh thread/turn identity
for each question, no local tools, and no intermediary model. An existing research worker can
gather the evidence and invoke this command without Workgraph changes.

Each private output directory retains `request.json`, `response.sse`, `response.json`,
`answer.md`, and `status.json` when available. `answer.md` preserves the bridge's returned text,
including its **Local tools unavailable** banner; that banner is expected in this design, not
an instruction to enable MCP. The raw response is retained so worker interpretation can remain
separate. The upstream browser may still provide native ChatGPT capabilities; this is not a
provider-enforced no-web-search mode.

There is no automatic retry, cancellation, conversation continuation, or durable background job
manager in this prototype. On interruption or an incomplete response, inspect retained artifacts
and the launcher's Activity view before another submission. Do not treat a local timeout as proof
that the remote request did not run. The client rejects an already-busy bridge, but this is a
readiness check, not a cross-process lock: run consultations serially. The socket timeout is
30 minutes, not a total wall-clock deadline. Keep the owning process alive until completion.

Upstream describes this as unofficial browser automation that may break when ChatGPT changes and
remains subject to OpenAI's terms and workspace policies.
