import { describe, expect, it } from "vitest";
import { isSafeCommand } from "../src/readonly.js";

describe("readonly bash policy", () => {
  it("allows read-only inspection commands", () => {
    expect(isSafeCommand("pwd")).toBe(true);
    expect(isSafeCommand("git status --short")).toBe(true);
    expect(isSafeCommand("rg foo src")).toBe(true);
    expect(isSafeCommand("npm list --depth=0")).toBe(true);
  });

  it("blocks filesystem mutation commands", () => {
    expect(isSafeCommand("touch file.txt")).toBe(false);
    expect(isSafeCommand("echo hi > file.txt")).toBe(false);
    expect(isSafeCommand("sed -i s/a/b/ file.txt")).toBe(false);
    expect(isSafeCommand("git add .")).toBe(false);
  });

  it("blocks network-capable bash commands", () => {
    expect(isSafeCommand("curl https://example.com")).toBe(false);
    expect(isSafeCommand("wget -O- https://example.com")).toBe(false);
    expect(isSafeCommand("git fetch origin")).toBe(false);
    expect(isSafeCommand("npm install")).toBe(false);
  });

  it("blocks pipe-to-interpreter composition", () => {
    expect(isSafeCommand("echo 'print(1)' | python")).toBe(false);
    expect(isSafeCommand("cat file | ruby")).toBe(false);
    expect(isSafeCommand("ls | bash")).toBe(false);
  });

  it("blocks command substitution with interpreters", () => {
    expect(isSafeCommand("echo $(node -e '1+1')")).toBe(false);
    expect(isSafeCommand('echo "$(python -c \'print(1)\')"')).toBe(false);
  });

  it("blocks awk inplace editing", () => {
    expect(isSafeCommand("awk -i inplace '{print}' file.txt")).toBe(false);
  });

  it("blocks git patch application", () => {
    expect(isSafeCommand("git apply patch.diff")).toBe(false);
    expect(isSafeCommand("git am patch.mbox")).toBe(false);
  });

  it("blocks standalone interpreters except version checks", () => {
    expect(isSafeCommand("perl -e 'print 1'")).toBe(false);
    expect(isSafeCommand("ruby -e 'puts 1'")).toBe(false);
    expect(isSafeCommand("php -r 'echo 1;'")).toBe(false);
    expect(isSafeCommand("python --version")).toBe(true);
    expect(isSafeCommand("python -c 'print(1)'")).toBe(false);
  });

  it("blocks shell helpers that can mutate through otherwise safe commands", () => {
    expect(isSafeCommand("find . -name '*.ts' -exec rm {} \\;")).toBe(false);
    expect(isSafeCommand("find . -name '*.ts' -exec sh -c 'echo bad > x' \\;")).toBe(false);
    expect(isSafeCommand("install -m 755 src dest")).toBe(false);
    expect(isSafeCommand("sort file 2> err.log")).toBe(false);
  });

  it("keeps common read-only composition working", () => {
    expect(isSafeCommand("cat package.json | jq .name")).toBe(true);
    expect(isSafeCommand("cat file | head -20")).toBe(true);
    expect(isSafeCommand("diff a b")).toBe(true);
  });

  it("blocks unknown archive and env wrapper commands by default", () => {
    expect(isSafeCommand("tar -xf archive.tar")).toBe(false);
    expect(isSafeCommand("unzip archive.zip")).toBe(false);
    expect(isSafeCommand("env VAR=1 ls")).toBe(false);
  });
});
