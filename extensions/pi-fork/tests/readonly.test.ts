import { describe, expect, it } from "vitest";
import { buildSandboxedCommand } from "../src/readonly.js";

describe("readonly bash sandbox", () => {
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
