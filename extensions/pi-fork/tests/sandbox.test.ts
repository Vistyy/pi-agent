import { describe, expect, it } from "vitest";
import { buildBwrapArgs, buildSandboxedCommand } from "../src/sandbox.js";

function optionValues(args: string[], option: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === option) values.push(args[i + 1]);
  }
  return values;
}

describe("sandbox command wrapper", () => {
  it("builds bwrap args for read-only workspace and writable temp", () => {
    const args = buildBwrapArgs();

    expect(args).toContain("--unshare-all");
    expect(args).toContain("--unshare-net");
    expect(args).not.toContain("--share-net");
    expect(args).toEqual(expect.arrayContaining([
      "--ro-bind", "$PWD", "$PWD",
      "--chdir", "$PWD",
      "--tmpfs", "/tmp",
      "--tmpfs", "/var/tmp",
      "--dir", "/tmp/home",
      "--ro-bind-try", "/run/current-system", "/run/current-system",
      "--setenv", "HOME", "/tmp/home",
      "--setenv", "TMPDIR", "/tmp",
    ]));
  });

  it("clears inherited env and binds only minimal /etc files by default", () => {
    const args = buildBwrapArgs();

    expect(args).toContain("--clearenv");
    expect(args).toEqual(expect.arrayContaining([
      "--setenv", "TERM", "${TERM:-xterm-256color}",
      "--setenv", "LANG", "${LANG:-C.UTF-8}",
      "--setenv", "LC_ALL", "${LC_ALL:-C.UTF-8}",
      "--setenv", "PATH", "/etc/profiles/per-user/$USER/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin",
      "--ro-bind-try", "/etc/passwd", "/etc/passwd",
      "--ro-bind-try", "/etc/group", "/etc/group",
      "--ro-bind-try", "/etc/nsswitch.conf", "/etc/nsswitch.conf",
    ]));
    expect(optionValues(args, "--ro-bind-try")).not.toContain("/etc");
  });

  it("allows arbitrary shell syntax by relying on the sandbox, not regex filtering", () => {
    const wrapped = buildSandboxedCommand("python - <<'PY'\nprint(1 + 1)\nPY\ncurl https://example.com");

    expect(wrapped).toContain("command -v bwrap");
    expect(wrapped).toContain("python - <<'\\''PY'\\''");
    expect(wrapped).toContain("curl https://example.com");
    expect(wrapped).toContain("--unshare-net");
  });

  it("can allow shell network separately from Pi offline mode", () => {
    const args = buildBwrapArgs({ bashNetwork: true });
    const wrapped = buildSandboxedCommand("curl https://example.com", { bashNetwork: true });

    expect(args).toContain("--share-net");
    expect(args).not.toContain("--unshare-net");
    expect(args).toEqual(expect.arrayContaining([
      "--ro-bind-try", "/etc/resolv.conf", "/etc/resolv.conf",
      "--ro-bind-try", "/etc/hosts", "/etc/hosts",
    ]));
    expect(wrapped).toContain("curl https://example.com");
  });

  it("can use a configured writable tmp dir", () => {
    const args = buildBwrapArgs({ tmpDir: "/tmp/pi-fork" });
    const wrapped = buildSandboxedCommand("mktemp -d", { tmpDir: "/tmp/pi-fork" });

    expect(args).toEqual(expect.arrayContaining([
      "--tmpfs", "/tmp",
      "--dir", "/tmp/pi-fork",
      "--setenv", "TMPDIR", "/tmp/pi-fork",
    ]));
    expect(wrapped).toContain("--dir \\\n  /tmp/pi-fork");
    expect(wrapped).toContain("TMPDIR \\\n  /tmp/pi-fork");
  });

  it("single-quotes commands safely", () => {
    const wrapped = buildSandboxedCommand("echo '$HOME' && echo done");

    expect(wrapped).toContain("bash -lc 'echo '\\''$HOME'\\'' && echo done'");
  });
});
