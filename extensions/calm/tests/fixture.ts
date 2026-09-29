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
import { isCompletionReportEnvelope } from "../completion-report.js";
import { loadCalmChatRuntime } from "../pi-runtime.js";
import { calmPreferences } from "../preferences.js";
import { discoverCalmChat } from "../projection.js";

function checkRail(theme: Parameters<typeof calmActivityLines>[3]): void {
  const state = new CalmActivity(() => {});
  state.start(0);
  const lines = (width: number) => calmActivityLines(state.snapshot(), 42000, width, theme, "low");
  const plain = (width = 160) => stripAnsi(lines(width).join("\n"));
  assert.equal(plain(), "⠴ Thinking   42s");
  assert.equal(
    stripAnsi(calmActivityLines(state.snapshot(), 42080, 160, theme, "low").join("")),
    "⠦ Thinking   42s",
  );
  assert.ok(lines(160)[0]?.startsWith(theme.fg("thinkingLow", "⠴")));
  const high = calmActivityLines(state.snapshot(), 42000, 160, theme, "high").join("");
  assert.ok(high.startsWith(theme.fg("thinkingHigh", "⠴")));
  state.message("text_delta");
  assert.equal(plain(), "⠴ Responding 42s");
  assert.equal(plain().indexOf("42s"), 13);
  state.message("thinking_delta");
  state.toolStart("1", "read", { path: "/private/note.txt" }, 100);
  state.toolEnd("1");
  assert.equal(plain(), "⠴ Thinking   42s · read note.txt");
  state.toolStart("brief", "bash", {}, 41999);
  assert.equal(plain(), "⠴ Thinking   42s · read note.txt");
  state.toolEnd("brief");
  assert.equal(plain(), "⠴ Thinking   42s · bash");
  state.toolStart("2", "read", { path: "/private/missing.txt" }, 200);
  state.toolEnd("2");
  assert.equal(plain(), "⠴ Thinking   42s · read missing.txt");
  state.toolStart("3", "edit", { path: "/private/note.txt" }, 300);
  state.toolEnd("3");
  assert.equal(plain(), "⠴ Thinking   42s · edit note.txt");
  state.toolStart("4", "bash", {}, 24000);
  state.toolStart("5", "read", { path: "/private/config.json" }, 25000);
  assert.equal(plain(), "⠴ Running    42s · bash +1 running");
  assert.equal(plain().indexOf("42s"), 13);
  state.toolStart("brief-parallel", "edit", { path: "brief.txt" }, 41999);
  assert.equal(plain(), "⠴ Running    42s · bash +1 running");
  state.toolEnd("brief-parallel");
  assert.ok(!plain().includes("/private/"));
  for (const width of [1, 10, 24, 40, 47, 48, 60, 80, 120, 160, 300]) {
    assert.ok(plain(width).startsWith("⠴"), `activity stays at column one at ${width} columns`);
    assert.equal(lines(width).length, 1);
    assert.ok(visibleWidth(lines(width)[0] ?? "") <= width, `rail fits ${width} columns`);
    if (width >= 40) assert.equal(plain(width), "⠴ Running    42s · bash +1 running");
  }
  state.toolEnd("2");
  assert.equal(plain(), "⠴ Running    42s · bash +1 running");
  state.toolEnd("4");
  assert.equal(plain(), "⠴ Running    42s · read config.json");
  state.promptStart(42000);
  assert.equal(plain(), "? Waiting    42s · for input");
  assert.equal(plain().indexOf("42s"), 13);
  state.promptEnd();
  state.toolEnd("5");
  assert.equal(plain(), "⠴ Thinking   42s · read config.json");
  state.message("text_delta");
  assert.equal(plain(), "⠴ Responding 42s · read config.json");
  state.toolStart("6", "bash", {}, 30000);
  state.toolEnd("6");
  assert.equal(plain(), "⠴ Thinking   42s · bash");
  state.settle();
  assert.deepEqual(lines(160), []);
  state.start(40000);
  assert.equal(plain(), "⠴ Thinking   2s");
  state.toolStart("7", "read", { path: "older.txt" }, 40500);
  state.toolStart("8", "edit", { path: "newer.txt" }, 41000);
  state.toolEnd("8");
  assert.equal(plain(), "⠴ Running    2s · read older.txt");
  state.toolEnd("7");
  assert.equal(plain(), "⠴ Thinking   2s · read older.txt");
  state.promptStart(42000);
  assert.equal(plain(), "? Waiting    2s · for input");
  state.promptEnd();
  assert.equal(plain(), "⠴ Thinking   2s · read older.txt");
  state.clear();
  assert.deepEqual(lines(160), []);
}

async function waitForRelease(path: string, signal: AbortSignal | undefined): Promise<void> {
  const deadline = Date.now() + 90000;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error("Verification release timed out.");
    await setTimeout(20, undefined, { signal });
  }
}

function checkReportEnvelope(): void {
  const prefix = "PSTACK_CHILD_REPORT_V1\n";
  const envelope = (payload: object) => `${prefix}${JSON.stringify(payload)}`;
  const full = envelope({
    id: "child-a",
    attempt: 1,
    status: "completed",
    report: { kind: "full", text: "" },
  });
  const preview = envelope({
    id: "child-b",
    attempt: 2,
    status: "failed",
    report: { kind: "preview", text: "head", omittedBytes: 4096 },
  });

  assert.equal(isCompletionReportEnvelope(full), true, "exact full envelope");
  assert.equal(isCompletionReportEnvelope(preview), true, "exact preview envelope");
  assert.equal(isCompletionReportEnvelope(full.replace("\n", "")), false, "prefix without newline");
  assert.equal(isCompletionReportEnvelope(`${full}\n`), false, "trailing newline");
  assert.equal(
    isCompletionReportEnvelope(`${prefix} ${full.slice(prefix.length)}`),
    false,
    "space before the JSON object",
  );
  assert.equal(
    isCompletionReportEnvelope(
      envelope({
        id: "child-c",
        attempt: 1,
        status: "completed",
        report: { kind: "full", text: "body" },
        transport: "queue",
      }),
    ),
    false,
    "extra top-level property",
  );
  assert.equal(
    isCompletionReportEnvelope(envelope({ id: "child-d", attempt: 1, status: "completed" })),
    false,
    "missing report",
  );
  assert.equal(
    isCompletionReportEnvelope(
      envelope({ id: "child-e", attempt: 0, status: "completed", report: { kind: "full", text: "b" } }),
    ),
    false,
    "zero attempt",
  );
  assert.equal(
    isCompletionReportEnvelope(
      envelope({
        id: "child-f",
        attempt: 1.5,
        status: "completed",
        report: { kind: "full", text: "b" },
      }),
    ),
    false,
    "fractional attempt",
  );
  assert.equal(
    isCompletionReportEnvelope(
      envelope({ id: "", attempt: 1, status: "completed", report: { kind: "full", text: "b" } }),
    ),
    false,
    "empty id",
  );
  assert.equal(
    isCompletionReportEnvelope(
      envelope({ id: "child-g", attempt: 1, status: "running", report: { kind: "full", text: "b" } }),
    ),
    false,
    "non terminal status",
  );
  assert.equal(
    isCompletionReportEnvelope(
      envelope({
        id: "child-h",
        attempt: 1,
        status: "completed",
        report: { kind: "full", text: "b", omittedBytes: 1 },
      }),
    ),
    false,
    "full report carrying omittedBytes",
  );
  assert.equal(
    isCompletionReportEnvelope(
      envelope({ id: "child-i", attempt: 1, status: "completed", report: { kind: "preview", text: "b" } }),
    ),
    false,
    "preview without omittedBytes",
  );
  assert.equal(
    isCompletionReportEnvelope(
      envelope({
        id: "child-j",
        attempt: 1,
        status: "completed",
        report: { kind: "preview", text: "b", omittedBytes: 0 },
      }),
    ),
    false,
    "zero omittedBytes",
  );
  assert.equal(isCompletionReportEnvelope(`${prefix}{"id":`), false, "malformed JSON");
  assert.equal(isCompletionReportEnvelope('{"id":"child-k"}'), false, "ordinary JSON");
  assert.equal(isCompletionReportEnvelope(undefined), false, "missing text metadata");
  assert.equal(isCompletionReportEnvelope(42), false, "non text metadata");
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
    fauxAssistantMessage([
      fauxThinking("MODEL_CONTINUES_AFTER_TOOLS ".repeat(60)),
      fauxText("CALM_FINAL"),
    ]),
  ];
  const reportEnvelope = (payload: object) => `PSTACK_CHILD_REPORT_V1\n${JSON.stringify(payload)}`;
  const reportCases = new Map<string, { readonly text: string; readonly reply: string }>([
    [
      "full",
      {
        text: reportEnvelope({
          id: "child-full",
          attempt: 1,
          status: "completed",
          report: { kind: "full", text: "REPORT-FULL-BODY" },
        }),
        reply: "REPORT-FULL-ACK",
      },
    ],
    [
      "preview",
      {
        text: reportEnvelope({
          id: "child-preview",
          attempt: 1,
          status: "failed",
          report: { kind: "preview", text: "REPORT-PREVIEW-HEAD", omittedBytes: 4096 },
        }),
        reply: "REPORT-PREVIEW-ACK",
      },
    ],
    [
      "near",
      {
        text: reportEnvelope({
          id: "child-near",
          attempt: 1,
          status: "completed",
          report: { kind: "full", text: "REPORT-NEAR-BODY" },
          padding: 1,
        }),
        reply: "REPORT-NEAR-ACK",
      },
    ],
    [
      "version",
      {
        text: `PSTACK_CHILD_REPORT_V2\n${JSON.stringify({
          id: "child-version",
          attempt: 1,
          status: "completed",
          report: { kind: "full", text: "REPORT-VERSION-BODY" },
        })}`,
        reply: "REPORT-VERSION-ACK",
      },
    ],
    [
      "malformed",
      {
        text: `PSTACK_CHILD_REPORT_V1\n{"id":"child-malformed","text":"REPORT-MALFORMED-BODY"`,
        reply: "REPORT-MALFORMED-ACK",
      },
    ],
    [
      "json",
      {
        text: JSON.stringify({
          id: "child-plain",
          attempt: 1,
          status: "completed",
          report: { kind: "full", text: "PLAIN-JSON-ROW" },
        }),
        reply: "PLAIN-JSON-ACK",
      },
    ],
    ["text", { text: "ORDINARY-USER-TEXT", reply: "ORDINARY-TEXT-ACK" }],
    [
      "off",
      {
        text: reportEnvelope({
          id: "child-off",
          attempt: 1,
          status: "completed",
          report: { kind: "full", text: "REPORT-OFF-BODY" },
        }),
        reply: "REPORT-OFF-ACK",
      },
    ],
  ]);
  const single = new Map<string, AssistantMessage>([
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

  for (const report of reportCases.values())
    single.set(report.text, fauxAssistantMessage(report.reply));
  const provider = fauxProvider({
    provider: "calm-fixture",
    models: [{ id: "scripted", reasoning: true }],
    tokensPerSecond: 120,
    tokenSize: { min: 8, max: 8 },
  });
  const responseGates = new Map([
    [1, "after-read"],
    [2, "after-failure"],
    [3, "after-edit"],
    [4, "after-parallel"],
  ]);
  provider.setResponses(
    Array.from({ length: 40 }, () => async (context, options) => {
      const userIndex = context.messages.findLastIndex((message) => message.role === "user");
      const user = context.messages[userIndex];
      const label = user?.role === "user" ? contentText(user.content) : "";
      const count = context.messages
        .slice(userIndex + 1)
        .filter((message) => message.role === "assistant").length;
      log({ type: "request", label, count });
      if (label === "fixture-run") {
        const gate = responseGates.get(count);
        if (gate !== undefined) {
          log({ type: "waiting-response", gate });
          await waitForRelease(join(directory, gate), options?.signal);
        }
        return sequence[count] ?? fauxAssistantMessage("UNEXPECTED_STEP");
      }
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
      const release = args.label === "abort" ? "release-abort" : "release";
      await waitForRelease(join(directory, release), signal);
      return { content: [{ type: "text", text: `HOLD_RESULT_${args.label}` }], details: {} };
    },
  });
  pi.on("session_start", () => log({ type: "ready", pid: process.pid }));
  pi.on("agent_settled", () => log({ type: "settled" }));
  pi.on("message_update", (event) => {
    if (event.assistantMessageEvent.type === "thinking_start") log({ type: "thinking-start" });
  });
  pi.on("tool_execution_end", (event) =>
    log({ type: "tool-end", name: event.toolName, error: event.isError }),
  );
  pi.registerCommand("calm-style", {
    description: "Inspect and change the isolated spinner theme",
    async handler(args, ctx) {
      if (args === "theme") assert.equal(ctx.ui.setTheme("light").success, true);
      if (args === "thinking") pi.setThinkingLevel("high");
      log({
        type: "style",
        spinner: ctx.ui.theme.getThinkingBorderColor(pi.getThinkingLevel())("X"),
        text: ctx.ui.theme.fg("muted", "X"),
      });
    },
  });
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
      if (args === "report-envelope") {
        checkReportEnvelope();
        log({ type: "report-envelope-checked" });
        ctx.ui.notify("REPORT_ENVELOPE_CHECKED", "info");
        return;
      }
      if (args.startsWith("report ")) {
        const name = args.slice("report ".length).trim();
        const report = reportCases.get(name);

        if (report === undefined) {
          ctx.ui.notify(`Unknown report fixture case ${name}.`, "warning");
          return;
        }
        log({ type: "report-sent", case: name, text: report.text });
        pi.sendUserMessage(report.text);
      }
    },
  });
}
