import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SANDBOX_CONFIG, loadConfig, type ForkSandboxConfig } from "./config.js";

const RAW_SHELL_ARGS = new Set([
  "$PWD",
  "${TERM:-xterm-256color}",
  "${LANG:-C.UTF-8}",
  "${LC_ALL:-C.UTF-8}",
  "/etc/profiles/per-user/$USER/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin",
]);

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shellArg(value: string): string {
  if (value === "$PWD") return '"$PWD"';
  if (RAW_SHELL_ARGS.has(value)) return value.includes("$") ? `"${value}"` : value;
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : shellQuote(value);
}

function resolveSandboxConfig(overrides: Partial<ForkSandboxConfig> = {}): ForkSandboxConfig {
  return { ...DEFAULT_SANDBOX_CONFIG, ...overrides };
}

function tmpDirArgs(tmpDir: string): string[] {
  if (["/tmp", "/var/tmp", "/tmp/home"].includes(tmpDir)) return [];
  return ["--dir", tmpDir];
}

export function buildBwrapArgs(sandboxConfig: Partial<ForkSandboxConfig> = {}): string[] {
  const config = resolveSandboxConfig(sandboxConfig);
  return [
    "--die-with-parent",
    "--unshare-all",
    config.bashNetwork ? "--share-net" : "--unshare-net",
    "--new-session",
    "--ro-bind-try", "/nix", "/nix",
    "--ro-bind-try", "/usr", "/usr",
    "--ro-bind-try", "/bin", "/bin",
    "--ro-bind-try", "/lib", "/lib",
    "--ro-bind-try", "/lib64", "/lib64",
    "--ro-bind-try", "/etc/passwd", "/etc/passwd",
    "--ro-bind-try", "/etc/group", "/etc/group",
    "--ro-bind-try", "/etc/nsswitch.conf", "/etc/nsswitch.conf",
    ...(config.bashNetwork
      ? [
          "--ro-bind-try", "/etc/resolv.conf", "/etc/resolv.conf",
          "--ro-bind-try", "/etc/hosts", "/etc/hosts",
        ]
      : []),
    "--ro-bind-try", "/run/current-system", "/run/current-system",
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp",
    "--tmpfs", "/var/tmp",
    ...tmpDirArgs(config.tmpDir),
    "--dir", "/tmp/home",
    "--ro-bind", "$PWD", "$PWD",
    "--chdir", "$PWD",
    "--clearenv",
    "--setenv", "HOME", "/tmp/home",
    "--setenv", "TMPDIR", config.tmpDir,
    "--setenv", "TERM", "${TERM:-xterm-256color}",
    "--setenv", "LANG", "${LANG:-C.UTF-8}",
    "--setenv", "LC_ALL", "${LC_ALL:-C.UTF-8}",
    "--setenv", "PATH", "/etc/profiles/per-user/$USER/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin",
  ];
}

function renderBwrapCommand(args: string[], command: string): string {
  const renderedArgs = args.map((arg) => `  ${shellArg(arg)} \\`).join("\n");
  return `if ! command -v bwrap >/dev/null 2>&1; then
  echo "Fork agent: bwrap is required for bash sandboxing but was not found." >&2
  exit 126
fi

bwrap \\
${renderedArgs}
  bash -lc ${shellQuote(command)}`;
}

export function buildSandboxedCommand(
  command: string,
  sandboxConfig: Partial<ForkSandboxConfig> = {},
): string {
  return renderBwrapCommand(buildBwrapArgs(sandboxConfig), command);
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
      event.input.command = buildSandboxedCommand(command, loadConfig(process.cwd()).sandbox);
    }

    return undefined;
  });
}
