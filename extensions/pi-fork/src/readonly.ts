import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildSandboxedCommand(command: string): string {
  const quotedCommand = shellQuote(command);

  return `if ! command -v bwrap >/dev/null 2>&1; then
  echo "Fork agent: bwrap is required for readonly bash sandboxing but was not found." >&2
  exit 126
fi

bwrap \\
  --die-with-parent \\
  --unshare-all \\
  --unshare-net \\
  --new-session \\
  --ro-bind-try /nix /nix \\
  --ro-bind-try /usr /usr \\
  --ro-bind-try /bin /bin \\
  --ro-bind-try /lib /lib \\
  --ro-bind-try /lib64 /lib64 \\
  --ro-bind-try /etc /etc \\
  --ro-bind-try /run/current-system /run/current-system \\
  --proc /proc \\
  --dev /dev \\
  --tmpfs /tmp \\
  --tmpfs /var/tmp \\
  --dir /tmp/home \\
  --ro-bind "$PWD" "$PWD" \\
  --chdir "$PWD" \\
  --setenv HOME /tmp/home \\
  --setenv TMPDIR /tmp \\
  --setenv PATH /etc/profiles/per-user/$USER/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin \\
  bash -lc ${quotedCommand}`;
}

export default function (pi: ExtensionAPI): void {
  pi.on("tool_call", async (event) => {
    if (event.toolName === "edit" || event.toolName === "write") {
      return {
        block: true,
        reason: "Fork agent: file modification is not allowed.",
      };
    }

    if (event.toolName === "bash") {
      const command = typeof event.input?.command === "string" ? event.input.command : "";
      event.input.command = buildSandboxedCommand(command);
    }

    return undefined;
  });
}
