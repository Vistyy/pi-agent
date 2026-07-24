import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_PATH =
  "/etc/profiles/per-user/$USER/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin";
const PATH_EXPRESSION = `\${PATH:-${DEFAULT_PATH}}`;
const CA_BUNDLE_SANDBOX_PATH = "/tmp/pi-codex-subagent-ca-bundle.crt";
const CA_BUNDLE_ENV_KEYS = [
  "SSL_CERT_FILE",
  "NIX_SSL_CERT_FILE",
  "GIT_SSL_CAINFO",
  "CURL_CA_BUNDLE",
  "REQUESTS_CA_BUNDLE",
  "NODE_EXTRA_CA_CERTS",
];
const RAW_SHELL_ARGS = new Set([
  "$PWD",
  "${TERM:-xterm-256color}",
  "${LANG:-C.UTF-8}",
  "${LC_ALL:-C.UTF-8}",
  DEFAULT_PATH,
  PATH_EXPRESSION,
]);

export interface SandboxCommandOptions {
  scratchDir: string;
  homeDir: string;
  bashNetwork?: boolean;
  persistentWritableDirectories?: string[];
  xdgCacheHome?: string;
}

function resolveExistingPath(value: string) {
  if (!path.isAbsolute(value) || !existsSync(value)) {
    throw new Error(`Sandbox path must exist and be absolute: ${value}`);
  }
  return realpathSync(value);
}

function resolveCaBundlePath() {
  const candidates = [
    "/etc/ssl/certs/ca-certificates.crt",
    "/etc/pki/tls/certs/ca-bundle.crt",
    "/etc/ssl/certs/ca-bundle.crt",
    "/nix/var/nix/profiles/default/etc/ssl/certs/ca-bundle.crt",
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return realpathSync(candidate);
    } catch {
      continue;
    }
  }
  return undefined;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shellArgument(value: string) {
  if (value === "$PWD") return '"$PWD"';
  if (RAW_SHELL_ARGS.has(value)) {
    return value.includes("$") ? `"${value}"` : value;
  }
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value)
    ? value
    : shellQuote(value);
}

function directoryArguments(directory: string) {
  const argumentsList: string[] = [];
  let current = "";
  for (const part of directory.split("/").filter(Boolean)) {
    current += `/${part}`;
    if (current !== "/tmp" && current !== "/var" && current !== "/var/tmp") {
      argumentsList.push("--dir", current);
    }
  }
  return argumentsList;
}

function caBundleArguments(caBundlePath: string | undefined) {
  if (!caBundlePath) return [];
  return ["--ro-bind-try", caBundlePath, CA_BUNDLE_SANDBOX_PATH];
}

function caBundleEnvironmentArguments(caBundlePath: string | undefined) {
  if (!caBundlePath) return [];
  return CA_BUNDLE_ENV_KEYS.flatMap((key) => [
    "--setenv",
    key,
    CA_BUNDLE_SANDBOX_PATH,
  ]);
}

function persistentWritableDirectoryArguments(directories: string[]) {
  return directories.flatMap((directory) => {
    const resolved = resolveExistingPath(directory);
    if (!statSync(resolved).isDirectory()) {
      throw new Error(`Persistent sandbox path must be a directory: ${resolved}`);
    }
    return ["--bind", resolved, resolved];
  });
}

export function buildBwrapArguments(options: SandboxCommandOptions) {
  const scratchDir = resolveExistingPath(options.scratchDir);
  const homeDir = resolveExistingPath(options.homeDir);
  if (!scratchDir.startsWith("/tmp/") && !scratchDir.startsWith("/var/tmp/")) {
    throw new Error(`Sandbox scratch directory must be under /tmp or /var/tmp: ${scratchDir}`);
  }
  const caBundlePath = resolveCaBundlePath();
  const bashNetwork = options.bashNetwork ?? true;
  const persistentWritableDirectories =
    options.persistentWritableDirectories ?? [];
  const xdgCacheHome = options.xdgCacheHome
    ? resolveExistingPath(options.xdgCacheHome)
    : undefined;

  return [
    "--die-with-parent",
    "--unshare-all",
    bashNetwork ? "--share-net" : "--unshare-net",
    "--new-session",
    "--ro-bind-try",
    "/nix",
    "/nix",
    "--ro-bind-try",
    "/usr",
    "/usr",
    "--ro-bind-try",
    "/bin",
    "/bin",
    "--ro-bind-try",
    "/sbin",
    "/sbin",
    "--ro-bind-try",
    "/lib",
    "/lib",
    "--ro-bind-try",
    "/lib64",
    "/lib64",
    "--ro-bind-try",
    "/home",
    "/home",
    "--ro-bind-try",
    "/root",
    "/root",
    "--ro-bind-try",
    "/opt",
    "/opt",
    "--ro-bind-try",
    "/mnt",
    "/mnt",
    "--ro-bind-try",
    "/media",
    "/media",
    "--ro-bind-try",
    "/srv",
    "/srv",
    "--ro-bind-try",
    "/etc/profiles",
    "/etc/profiles",
    "--ro-bind-try",
    "/run/wrappers",
    "/run/wrappers",
    "--ro-bind-try",
    "/etc/passwd",
    "/etc/passwd",
    "--ro-bind-try",
    "/etc/group",
    "/etc/group",
    "--ro-bind-try",
    "/etc/nsswitch.conf",
    "/etc/nsswitch.conf",
    ...(bashNetwork
      ? [
          "--ro-bind-try",
          "/etc/resolv.conf",
          "/etc/resolv.conf",
          "--ro-bind-try",
          "/etc/hosts",
          "/etc/hosts",
        ]
      : []),
    "--ro-bind-try",
    "/run/current-system",
    "/run/current-system",
    "--overlay-src",
    homeDir,
    "--tmp-overlay",
    homeDir,
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--tmpfs",
    "/tmp",
    "--tmpfs",
    "/var/tmp",
    ...directoryArguments(scratchDir),
    "--bind",
    scratchDir,
    scratchDir,
    ...caBundleArguments(caBundlePath),
    "--ro-bind",
    "$PWD",
    "$PWD",
    "--overlay-src",
    "$PWD",
    "--tmp-overlay",
    "$PWD",
    ...persistentWritableDirectoryArguments(persistentWritableDirectories),
    "--chdir",
    "$PWD",
    "--clearenv",
    ...caBundleEnvironmentArguments(caBundlePath),
    "--setenv",
    "HOME",
    homeDir,
    "--setenv",
    "TMPDIR",
    scratchDir,
    ...(xdgCacheHome
      ? ["--setenv", "XDG_CACHE_HOME", xdgCacheHome]
      : []),
    "--setenv",
    "TERM",
    "${TERM:-xterm-256color}",
    "--setenv",
    "LANG",
    "${LANG:-C.UTF-8}",
    "--setenv",
    "LC_ALL",
    "${LC_ALL:-C.UTF-8}",
    "--setenv",
    "PATH",
    PATH_EXPRESSION,
  ];
}

function renderBwrapCommand(argumentsList: string[], command: string) {
  const renderedArguments = argumentsList
    .map((argument) => `  ${shellArgument(argument)} \\`)
    .join("\n");
  return `if ! command -v bwrap >/dev/null 2>&1; then
  echo "Subagent sandbox: bwrap is required but was not found." >&2
  exit 126
fi

bwrap \\
${renderedArguments}
  bash -lc ${shellQuote(command)}`;
}

export function buildSandboxedCommand(
  command: string,
  options: SandboxCommandOptions,
) {
  return renderBwrapCommand(buildBwrapArguments(options), command);
}
