import { describe, expect, it } from "vitest";
import { findPolicyViolation } from "../src/policy.js";

function isBlocked(command: string) {
  return findPolicyViolation(command) !== undefined;
}

describe("package manager policy", () => {
  it.each([
    "npm install",
    "npx eslint .",
    "corepack enable; npm install",
    "test -f package.json && npx tsc",
    "FOO=1 npm test",
    "sudo npm install",
    "env CI=1 npx vitest",
    "$(npm --version)",
    "`npm --version`",
    "echo $(npm --version)",
    "echo \"$(npm --version)\"",
    "echo \"`npm --version`\"",
    "/usr/bin/npm install",
  ])("blocks npm and npx command usage: %s", (command) => {
    expect(isBlocked(command)).toBe(true);
  });

  it.each([
    "pip install pytest",
    "pip3 install pytest",
    "pip3.12 install pytest",
    "pipx install ruff",
    "virtualenv .venv",
    "python -m pip install pytest",
    "python3 -m venv .venv",
    "python3.12 -m pip install pytest",
    "sudo python -m pip install pytest",
    "/usr/bin/pip install pytest",
  ])("blocks Python package and environment tools: %s", (command) => {
    expect(isBlocked(command)).toBe(true);
  });

  it.each([
    "pnpm install",
    "pnpm dlx eslint .",
    "uv add pytest",
    "uv pip install pytest",
    "uvx ruff",
    "uv venv",
    "python script.py",
    "python -m pytest",
    "python - <<'PY'\nprint('ok')\nPY",
  ])("allows preferred or unrelated commands: %s", (command) => {
    expect(isBlocked(command)).toBe(false);
  });

  it.each([
    "echo npm install > note.txt",
    "printf '%s\\n' 'npm install' > note.txt",
    "printf '%s\\n' \"pip install pytest\" > note.txt",
    "printf '%s\\n' '$(npm --version)' > note.txt",
    "cat > note.txt <<'EOF'\nnpm install\npip install pytest\nEOF",
    "python - <<'PY'\nprint('pip install pytest')\nPY",
    "# npm install\necho done",
  ])("allows quoted, commented, and heredoc text: %s", (command) => {
    expect(isBlocked(command)).toBe(false);
  });
});
