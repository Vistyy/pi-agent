import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { ACTIVITY_INTERVAL_MS, CalmActivity, calmActivityLines } from "./activity.js";
import { loadCalmChatRuntime } from "./pi-runtime.js";
import { calmPreferences } from "./preferences.js";
import { attachCalmProjection, type CalmProjection, discoverCalmChat } from "./projection.js";

type Mode =
  | { readonly kind: "inactive" }
  | { readonly kind: "starting"; readonly ui: ExtensionUIContext }
  | { readonly kind: "unavailable"; readonly ui: ExtensionUIContext }
  | {
      readonly kind: "ready";
      readonly ui: ExtensionUIContext;
      readonly projection: CalmProjection;
      enabled: boolean;
    };

const ENTRY = "pi-calm-preference";
const WIDGET = "pi-calm-activity";
const Preference = Type.Object({ sessionId: Type.String(), on: Type.Boolean() });

function savedChoice(ctx: ExtensionContext): boolean | undefined {
  const entries = ctx.sessionManager.getEntries();
  const id = ctx.sessionManager.getSessionId();

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry?.type !== "custom" || entry.customType !== ENTRY) continue;
    if (Value.Check(Preference, entry.data) && entry.data.sessionId === id) return entry.data.on;
  }

  return undefined;
}

function captureTui(ui: ExtensionUIContext): TUI {
  let captured: TUI | undefined;
  ui.setWidget("pi-calm-probe", (tui) => {
    captured = tui;

    return { render: () => [], invalidate() {} };
  });
  ui.setWidget("pi-calm-probe", undefined);

  if (captured === undefined) throw new Error("the Pi TUI root is unavailable.");

  return captured;
}

export default function calm(pi: ExtensionAPI): void {
  const preferences = calmPreferences();
  let mode: Mode = { kind: "inactive" };
  let timer: ReturnType<typeof setInterval> | undefined;
  let widget: { requestRender: () => void } | undefined;

  const stopTimer = (): void => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };

  const clearWidget = (ui: ExtensionUIContext): void => {
    stopTimer();
    if (widget !== undefined) ui.setWidget(WIDGET, undefined);
    widget = undefined;
  };

  const syncActivity = (): void => {
    if (mode.kind !== "ready") return;
    const snapshot = activity.snapshot();

    if (!mode.enabled || snapshot.kind === "idle") {
      clearWidget(mode.ui);

      return;
    }

    if (widget === undefined) {
      const ui = mode.ui;
      ui.setWidget(WIDGET, (tui) => {
        const owned = { requestRender: () => tui.requestRender() };
        widget = owned;

        return {
          render: (width) =>
            calmActivityLines(
              activity.snapshot(),
              performance.now(),
              width,
              ui.theme,
              pi.getThinkingLevel(),
            ),
          invalidate() {},
          dispose() {
            if (widget === owned) widget = undefined;
          },
        };
      });
    } else widget.requestRender();

    if (timer === undefined) {
      timer = setInterval(() => widget?.requestRender(), ACTIVITY_INTERVAL_MS);
      timer.unref();
    }
  };

  const activity = new CalmActivity(syncActivity);

  const sync = (): void => {
    if (mode.kind !== "ready") return;
    mode.projection.setEnabled(mode.enabled);
    mode.ui.setWorkingVisible(!mode.enabled);
    mode.ui.setStatus("calm", mode.enabled ? mode.ui.theme.fg("dim", "calm") : undefined);
    syncActivity();
  };

  const shutdown = (): void => {
    const previous = mode;
    mode = { kind: "inactive" };
    stopTimer();
    activity.clear();

    if (previous.kind === "inactive") return;
    clearWidget(previous.ui);
    previous.ui.setStatus("calm", undefined);

    if (previous.kind === "ready") {
      previous.projection.detach();
      previous.ui.setWorkingVisible(true);
    }
  };

  const unavailable = (owner: Mode, message: string): void => {
    if (mode !== owner || owner.kind === "inactive") return;
    const ui = owner.ui;
    shutdown();
    mode = { kind: "unavailable", ui };
    ui.notify(`Calm unavailable. ${message} Native transcript remains visible.`, "warning");
  };

  pi.on("session_start", async (_event, ctx) => {
    shutdown();

    if (ctx.mode !== "tui") return;
    const pending: Mode = { kind: "starting", ui: ctx.ui };
    mode = pending;
    let owner: Mode = pending;

    try {
      const saved = savedChoice(ctx);
      const enabled = saved ?? (await preferences.load());
      const runtime = await loadCalmChatRuntime();

      if (mode !== pending) return;
      const projection = attachCalmProjection(discoverCalmChat(captureTui(ctx.ui), runtime), {
        runtime,
        styleSeparator: (text) => ctx.ui.theme.fg("dim", text),
        onIncompatible: (message) => {
          const affected = owner;
          queueMicrotask(() => unavailable(affected, message));
        },
      });
      owner = { kind: "ready", ui: ctx.ui, projection, enabled };
      mode = owner;

      if (saved === undefined)
        pi.appendEntry(ENTRY, { sessionId: ctx.sessionManager.getSessionId(), on: enabled });
      if (!ctx.isIdle()) activity.start(performance.now());
      sync();
    } catch (error: unknown) {
      unavailable(owner, error instanceof Error ? error.message : String(error));
    }
  });

  pi.on("agent_start", () => {
    if (mode.kind === "ready") activity.start(performance.now());
  });
  pi.on("message_update", (event) => {
    if (mode.kind === "ready" && event.message.role === "assistant")
      activity.message(event.assistantMessageEvent.type);
  });
  pi.on("tool_execution_start", (event) => {
    if (mode.kind === "ready")
      activity.toolStart(event.toolCallId, event.toolName, event.args, performance.now());
  });
  pi.on("tool_execution_end", (event) => {
    if (mode.kind === "ready") activity.toolEnd(event.toolCallId);
  });
  pi.on("agent_settled", () => activity.settle());
  pi.on("ui_prompt_start", () => {
    if (mode.kind === "ready") activity.promptStart(performance.now());
  });
  pi.on("ui_prompt_end", () => activity.promptEnd());
  pi.on("session_shutdown", shutdown);

  pi.registerCommand("calm", {
    description:
      "Toggle Calm for this session; /calm default on|off sets the default for new sessions",
    getArgumentCompletions: (prefix) =>
      ["default on", "default off"].flatMap((value) =>
        value !== prefix && value.startsWith(prefix) ? [{ value, label: value }] : [],
      ),
    async handler(args, ctx) {
      const command = args.trim();
      const owner = mode;

      if (command === "default on" || command === "default off") {
        return preferences.save(command === "default on").then(
          () => {
            if (mode === owner)
              ctx.ui.notify(
                "Calm default saved for new sessions. This session is unchanged.",
                "info",
              );
          },
          (error: unknown) => {
            if (mode === owner)
              ctx.ui.notify(
                `Could not save Calm preference. ${error instanceof Error ? error.message : String(error)}`,
                "error",
              );
          },
        );
      }

      if (command !== "") {
        ctx.ui.notify("Usage: /calm or /calm default on|off", "warning");
        return;
      }

      if (mode.kind !== "ready" || ctx.mode !== "tui") {
        ctx.ui.notify(
          "Calm is unavailable in this session. Native transcript remains visible.",
          "warning",
        );
        return;
      }

      pi.appendEntry(ENTRY, { sessionId: ctx.sessionManager.getSessionId(), on: !mode.enabled });
      mode.enabled = !mode.enabled;
      sync();
      ctx.ui.notify(`Calm ${mode.enabled ? "on" : "off"} for this session.`, "info");
    },
  });
}
