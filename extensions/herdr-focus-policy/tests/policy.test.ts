import { describe, expect, it } from "vitest";
import { hasHerdrFocusChange } from "../src/policy.js";

const focusCommands = [
  "herdr pane split --current --direction right --focus",
  "herdr tab create --focus",
  "herdr workspace create --focus",
  "herdr worktree create --branch test --focus",
  "herdr pane focus --direction right --current",
  "herdr tab focus w1:t2",
  "herdr workspace focus w2",
  "herdr agent focus reviewer",
  "herdr plugin pane focus w1:p3",
  "cd /tmp && /usr/bin/herdr pane split --current --focus",
  "HERDR_SOCKET_PATH=/tmp/herdr.sock herdr tab create --focus",
  "herdr pane split --current \\\n    --direction right \\\n    --focus",
];

describe("hasHerdrFocusChange", () => {
  it.each(focusCommands)("detects %s", (command) => {
    expect(hasHerdrFocusChange(command)).toBe(true);
  });

  it.each([
    "herdr pane split --current --direction right",
    "herdr pane split --current --direction right --no-focus",
    "herdr tab create --label focus",
    "herdr pane run w1:p2 echo focus",
    "echo 'herdr pane split --focus'",
    "printf '%s\\n' --focus",
  ])("allows %s", (command) => {
    expect(hasHerdrFocusChange(command)).toBe(false);
  });
});
