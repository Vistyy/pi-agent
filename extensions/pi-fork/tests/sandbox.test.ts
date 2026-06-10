import { describe, expect, it } from "vitest";
import { buildSandboxedCommand } from "../src/sandbox.js";

describe("sandbox command wrapper", () => {
  it("wraps bash commands in bwrap", () => {
    const wrapped = buildSandboxedCommand("pwd && rg foo");

    expect(wrapped).toContain("command -v bwrap");
    expect(wrapped).toContain("bwrap");
    expect(wrapped).toContain("--unshare-all");
    expect(wrapped).toContain("--unshare-net");
    expect(wrapped).toContain('--ro-bind "$PWD" "$PWD"');
    expect(wrapped).toContain('--chdir "$PWD"');
    expect(wrapped).toContain("--tmpfs /tmp");
    expect(wrapped).toContain("--ro-bind-try /run/current-system /run/current-system");
    expect(wrapped).toContain("--setenv HOME /tmp/home");
    expect(wrapped).toContain("--setenv PATH /etc/profiles/per-user/$USER/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin");
    expect(wrapped).toContain("bash -lc 'pwd && rg foo'");
  });

  it("clears inherited env and binds only minimal /etc files", () => {
    const wrapped = buildSandboxedCommand("env");

    expect(wrapped).toContain("--clearenv");
    expect(wrapped).toContain("--setenv HOME /tmp/home");
    expect(wrapped).toContain("--setenv TMPDIR /tmp");
    expect(wrapped).toContain("--setenv TERM");
    expect(wrapped).toContain("--setenv LANG");
    expect(wrapped).toContain("--setenv LC_ALL");
    expect(wrapped).toContain("--setenv PATH");
    expect(wrapped).not.toContain("--ro-bind-try /etc /etc");
    expect(wrapped).toContain("--ro-bind-try /etc/passwd /etc/passwd");
    expect(wrapped).toContain("--ro-bind-try /etc/group /etc/group");
    expect(wrapped).toContain("--ro-bind-try /etc/nsswitch.conf /etc/nsswitch.conf");
  });

  it("allows arbitrary shell syntax by relying on the sandbox, not regex filtering", () => {
    const wrapped = buildSandboxedCommand("python - <<'PY'\nprint(1 + 1)\nPY\ncurl https://example.com");

    expect(wrapped).toContain("python - <<'\\''PY'\\''");
    expect(wrapped).toContain("curl https://example.com");
    expect(wrapped).toContain("--unshare-net");
  });

  it("single-quotes commands safely", () => {
    const wrapped = buildSandboxedCommand("echo '$HOME' && echo done");

    expect(wrapped).toContain("bash -lc 'echo '\\''$HOME'\\'' && echo done'");
  });
});
