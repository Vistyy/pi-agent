import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import statusline, { formatFooterLines } from "./statusline.ts";

const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, "");

test("footer puts the truncated session name below all status metrics", () => {
  const lines = formatFooterLines(["first metric", "last metric"], "A descriptive session name", 12);
  assert.deepEqual(lines.slice(0, -1), ["first metric", "last metric"]);
  assert.equal(stripAnsi(lines.at(-1)!), "A descripti…");
  assert.equal(visibleWidth(lines.at(-1)!), 12);
});

test("footer omits the bottom line when the session is unnamed", () => {
  assert.deepEqual(formatFooterLines(["metrics"], undefined, 12), ["metrics"]);
  assert.deepEqual(formatFooterLines(["metrics"], "   ", 12), ["metrics"]);
});

test("custom footer keeps the live session name as its final line", () => {
  const handlers: Record<string, (event: unknown, ctx: any) => unknown> = {};
  let footerFactory: ((tui: any, theme: any, data: any) => { render(width: number): string[]; dispose(): void }) | undefined;
  let sessionName: string | undefined = "Initial Session";

  statusline({
    on: (event: string, handler: (event: unknown, ctx: any) => unknown) => { handlers[event] = handler; },
    getThinkingLevel: () => "low",
    getSessionName: () => sessionName,
    registerCommand: () => {},
    exec: async () => ({ code: 1, stdout: "", stderr: "" }),
  } as any);

  const ctx = {
    cwd: "/tmp",
    model: { id: "test-model" },
    getContextUsage: () => undefined,
    sessionManager: { getBranch: () => [] },
    ui: {
      setFooter: (factory: typeof footerFactory) => { footerFactory = factory; },
    },
  };

  handlers.session_start!({}, ctx);
  const footer = footerFactory!(
    { requestRender: () => {} },
    { fg: (_color: string, value: string) => value },
    {
      getExtensionStatuses: () => new Map(),
      getGitBranch: () => undefined,
      onBranchChange: () => () => {},
    },
  );

  let lines = footer.render(80);
  assert.equal(lines.at(-1), "Initial Session");
  assert.ok(lines.slice(0, -1).every((line) => !line.includes("Initial Session")));

  sessionName = "Renamed Session";
  handlers.session_info_changed!({}, ctx);
  lines = footer.render(80);
  assert.equal(lines.at(-1), "Renamed Session");

  sessionName = "   ";
  handlers.session_info_changed!({}, ctx);
  assert.ok(footer.render(80).every((line) => !line.includes("Renamed Session")));
  footer.dispose();
});
