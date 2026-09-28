import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { stripVTControlCharacters as stripAnsi } from "node:util";
import {
  type AssistantMessage,
  contentText,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { type ExtensionAPI, SessionManager } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { CalmActivity, calmActivityLines } from "../activity.js";
import { loadCalmChatRuntime } from "../pi-runtime.js";
import { calmPreferences } from "../preferences.js";
import { discoverCalmChat } from "../projection.js";

function checkRail(theme: Parameters<typeof calmActivityLines>[3]): void {
  const state = new CalmActivity(() => {});
  state.start(0);
  state.toolStart("1", "read", { path: "/private/note.txt" }, 100);
  state.toolEnd("1", false);
  state.toolStart("2", "read", { path: "/private/missing.txt" }, 200);
  state.toolEnd("2", true);
  state.toolStart("3", "edit", { path: "/private/note.txt" }, 300);
  state.toolEnd("3", false);
  state.toolStart("4", "bash", {}, 24000);
  state.toolStart("5", "read", { path: "/private/config.json" }, 25000);
  const lines = (width: number) => calmActivityLines(state.snapshot(), 42000, width, theme);
  const wide = stripAnsi(lines(160).join("\n"));
  assert.match(wide, /✓ read note.txt · × read missing.txt · ✓ edit note.txt/);
  assert.match(wide, /● bash 18s \+1 running/);
  assert.match(wide, /42s total$/);
  assert.ok(!wide.includes("/private/"));
  for (const width of [1, 10, 24, 40, 47, 48, 60, 80, 120, 160]) {
    assert.equal(lines(width).length, 1);
    assert.ok(visibleWidth(lines(width)[0] ?? "") <= width, `rail fits ${width} columns`);
    if (width >= 24) assert.equal(visibleWidth(lines(width)[0] ?? ""), width);
  }
  assert.ok(!stripAnsi(lines(80).join("\n")).includes("✓ read note.txt"));
  state.toolEnd("4", false);
  assert.match(stripAnsi(lines(160).join("\n")), /● read config.json 17s/);
  state.promptStart(42000);
  assert.match(stripAnsi(lines(160).join("\n")), /Awaiting input/);
  state.promptEnd();
  state.settle();
  assert.deepEqual(lines(160), []);
}

export default function fixture(pi: ExtensionAPI): void {
  const directory = process.env.CALM_VERIFY_DIR;
  if (directory === undefined) throw new Error("CALM_VERIFY_DIR is required.");
  const log = (event: object) =>
    appendFileSync(join(directory, "events.jsonl"), `${JSON.stringify(event)}\n`);
  const read = (path: string, id: string) =>
    fauxAssistantMessage([fauxThinking(`THOUGHT_${id}`), fauxToolCall("read", { path }, { id })], {
      stopReason: "toolUse",
    });
  const sequence = [
    read("note.txt", "read-note"),
    read("missing.txt", "read-missing"),
    fauxAssistantMessage(
      fauxToolCall(
        "edit",
        { path: "note.txt", oldText: "BEFORE", newText: "AFTER" },
        { id: "edit-note" },
      ),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxText("VISIBLE_ASSISTANT_NOTE"),
        fauxToolCall("probe_hold", { label: "a" }, { id: "hold-a" }),
        fauxToolCall("probe_hold", { label: "b" }, { id: "hold-b" }),
      ],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage("CALM_FINAL"),
  ];
  const single = new Map([
    [
      "fixture-abort",
      fauxAssistantMessage(fauxToolCall("probe_hold", { label: "abort" }, { id: "abort-hold" }), {
        stopReason: "toolUse",
      }),
    ],
    [
      "fixture-stream",
      fauxAssistantMessage(
        `STREAM_VISIBLE ${"A streamed reply arrives in pieces. ".repeat(14)} STREAM_FINAL`,
      ),
    ],
    ["fixture-truncated", fauxAssistantMessage("VISIBLE_PARTIAL_REPLY", { stopReason: "length" })],
  ]);
  const provider = fauxProvider({
    provider: "calm-fixture",
    models: [{ id: "scripted", reasoning: true }],
    tokensPerSecond: 120,
    tokenSize: { min: 8, max: 8 },
  });
  provider.setResponses(
    Array.from({ length: 40 }, () => (context) => {
      const userIndex = context.messages.findLastIndex((message) => message.role === "user");
      const user = context.messages[userIndex];
      const label = user?.role === "user" ? contentText(user.content) : "";
      const count = context.messages
        .slice(userIndex + 1)
        .filter((message) => message.role === "assistant").length;
      log({ type: "request", label, count });
      if (label === "fixture-run")
        return sequence[count] ?? fauxAssistantMessage("UNEXPECTED_STEP");
      return single.get(label) ?? fauxAssistantMessage("UNEXPECTED_REQUEST");
    }),
  );
  pi.registerProvider(provider.provider);
  pi.registerMarkdownTransformer((text, context) =>
    context.messageType === "assistant" && text.includes("STREAM_VISIBLE")
      ? `${text}\n${context.isStreaming ? "STREAM_FLAG_LIVE" : "STREAM_FLAG_SETTLED"}`
      : text,
  );
  pi.registerTool({
    name: "probe_hold",
    label: "probe_hold",
    description: "Hold an owned verification tool until released",
    parameters: Type.Object({ label: Type.String() }),
    executionMode: "parallel",
    async execute(_id, args, signal, update) {
      log({ type: "hold-start", label: args.label });
      update?.({ content: [{ type: "text", text: `HOLD_PARTIAL_${args.label}` }], details: {} });
      const deadline = Date.now() + 90000;
      const release = args.label === "abort" ? "release-abort" : "release";
      while (!existsSync(join(directory, release))) {
        if (Date.now() > deadline) throw new Error("Verification tool release timed out.");
        await setTimeout(20, undefined, { signal });
      }
      return { content: [{ type: "text", text: `HOLD_RESULT_${args.label}` }], details: {} };
    },
  });
  pi.on("session_start", () => log({ type: "ready", pid: process.pid }));
  pi.on("agent_settled", () => log({ type: "settled" }));
  pi.on("tool_execution_end", (event) =>
    log({ type: "tool-end", name: event.toolName, error: event.isError }),
  );
  pi.registerCommand("calm-probe", {
    description: "Control the isolated Calm verification",
    async handler(args, ctx) {
      if (args === "exit") {
        ctx.shutdown();
        return;
      }
      if (args === "check") {
        checkRail(ctx.ui.theme);
        const prefs = calmPreferences(join(directory, "check-preferences", "default"));
        assert.equal(await prefs.load(), true);
        await prefs.save(false);
        assert.equal(await prefs.load(), false);
        await prefs.save(true);
        assert.equal(await prefs.load(), true);
        log({ type: "checked" });
        ctx.ui.notify("RAIL_AND_PREFERENCES_CHECKED", "info");
        return;
      }
      if (args === "notice") {
        ctx.ui.notify("VISIBLE_NATIVE_NOTICE", "warning");
        return;
      }
      if (args === "prompt") {
        await ctx.ui.confirm("INPUT_PROBE", "Confirm the owned verification prompt.");
        log({ type: "prompt-ended" });
        return;
      }
      if (args === "seed-overlay") {
        const child = SessionManager.create(directory, join(directory, "saved-child"));
        child.appendMessage({ role: "user", content: "Saved overlay probe", timestamp: 1 });
        child.appendMessage(
          fauxAssistantMessage(
            [
              fauxThinking("OVERLAY_THINKING"),
              fauxToolCall("read", { path: "overlay.txt" }, { id: "overlay-read" }),
            ],
            { stopReason: "toolUse" },
          ),
        );
        child.appendMessage({
          role: "toolResult",
          toolCallId: "overlay-read",
          toolName: "read",
          isError: false,
          content: [{ type: "text", text: "OVERLAY_TOOL_RESULT" }],
          timestamp: 2,
        });
        child.appendMessage(fauxAssistantMessage("OVERLAY_FINAL"));
        pi.appendEntry("pstack-task", {
          version: 1,
          owner: ctx.sessionManager.getSessionId(),
          id: "calm-overlay-probe",
          sourceCallId: "synthetic-record",
          config: {
            profile: "generalPurpose",
            cwd: directory,
            readonly: true,
            selector: "calm-fixture/scripted:low",
          },
          transcript: child.getSessionFile(),
          sessionId: child.getSessionId(),
          attempt: 1,
          prompt: "Saved overlay probe",
          assignment: "Inspect a saved transcript without executing a child",
          outcome: { status: "completed", output: "OVERLAY_FINAL" },
        });
        log({ type: "overlay-seeded" });
        return;
      }
      if (args === "break") {
        const runtime = await loadCalmChatRuntime();
        ctx.ui.setWidget("calm-failure-probe", (tui) => {
          const chat = discoverCalmChat(tui, runtime);
          let message = fauxAssistantMessage("NATIVE_FALLBACK_VISIBLE");
          const component = new runtime.assistant(message);
          Object.defineProperty(component, "lastMessage", {
            get: () => message,
            set: (next: AssistantMessage) => {
              message = next;
            },
          });
          chat.addChild(component);
          tui.requestRender();
          return { render: () => [], invalidate() {} };
        });
        ctx.ui.setWidget("calm-failure-probe", undefined);
        return;
      }
      if (args === "assert-file") {
        assert.equal(readFileSync(join(directory, "note.txt"), "utf8"), "AFTER\n");
        log({ type: "file-checked" });
      }
    },
  });
}
