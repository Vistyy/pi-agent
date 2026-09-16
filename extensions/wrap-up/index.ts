import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  AUDIT_SYSTEM_PROMPT,
  WRAP_UP_INVENTORY_MESSAGE,
  buildEvidencePrompt,
  buildPresentationMessage,
  estimateTokens,
  extractConversationEvidence,
  parseWrapUpModelSelection,
} from "./logic.ts";

const MAX_OUTPUT_TOKENS = 8_192;
const INPUT_SAFETY_TOKENS = 8_192;
const AUDIT_TIMEOUT_MS = 10 * 60 * 1_000;

export default function wrapUp(pi: ExtensionAPI): void {
  let running = false;
  let controller: AbortController | undefined;

  pi.on("session_shutdown", () => controller?.abort());

  pi.registerCommand("wrap-up", {
    description: "Audit the complete active conversation path for unresolved discussion loops",
    handler: async (args, ctx) => {
      if (args.trim()) {
        ctx.ui.notify("Usage: /wrap-up", "warning");
        return;
      }
      if (running) {
        ctx.ui.notify("A wrap-up audit is already running.", "warning");
        return;
      }

      running = true;
      try {
        await ctx.waitForIdle();
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), AUDIT_TIMEOUT_MS);
        try {
          await runAudit(pi, ctx, controller.signal);
        } finally {
          clearTimeout(timeout);
          controller = undefined;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Wrap-up audit failed: ${message}`, "error");
      } finally {
        running = false;
      }
    },
  });
}

async function runAudit(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  signal: AbortSignal,
): Promise<void> {
  const branch = ctx.sessionManager.getBranch();
  const cutoffEntryId = ctx.sessionManager.getLeafId() ?? undefined;
  const sessionId = ctx.sessionManager.getSessionId();
  const evidence = extractConversationEvidence(branch);
  if (!evidence.text) {
    ctx.ui.notify("No user or assistant conversation text was found on the active path.", "warning");
    return;
  }

  const settings = await loadWrapUpSettings();
  const model = settings
    ? ctx.modelRegistry.find(settings.provider, settings.model)
    : ctx.model;
  if (!model) {
    const target = settings
      ? `${settings.provider}/${settings.model}`
      : "the current session model";
    throw new Error(`Could not find ${target}.`);
  }
  if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
    throw new Error(`No authentication is configured for ${model.provider}/${model.id}.`);
  }
  const thinkingLevel = settings?.thinkingLevel ?? ctx.thinkingLevel ?? "high";

  const prompt = buildEvidencePrompt(evidence, { id: sessionId, cutoffEntryId });
  const outputTokens = Math.min(MAX_OUTPUT_TOKENS, model.maxTokens);
  const estimatedInput = estimateTokens(AUDIT_SYSTEM_PROMPT) + estimateTokens(prompt);
  const safeInputLimit = model.contextWindow - outputTokens - INPUT_SAFETY_TOKENS;
  if (estimatedInput > safeInputLimit) {
    throw new Error(
      `The normalized conversation is about ${estimatedInput.toLocaleString()} tokens, exceeding the safe single-pass limit of ${Math.max(0, safeInputLimit).toLocaleString()} for ${model.provider}/${model.id}. No history was truncated.`,
    );
  }

  ctx.ui.notify(
    `Inventorying ${evidence.entryCount.toLocaleString()} conversation entries with ${model.provider}/${model.id}:${thinkingLevel} (~${estimatedInput.toLocaleString()} input tokens)...`,
    "info",
  );

  const response = await ctx.modelRegistry.complete(
    model,
    {
      systemPrompt: AUDIT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
          timestamp: Date.now(),
        },
      ],
    },
    {
      reasoning: thinkingLevel === "off" ? undefined : thinkingLevel,
      maxTokens: outputTokens,
      signal,
      cacheRetention: "none",
    },
  );

  if (signal.aborted) throw new Error("The audit was cancelled before it could be presented.");
  const conversationChanged =
    ctx.sessionManager.getSessionId() !== sessionId
    || (ctx.sessionManager.getLeafId() ?? undefined) !== cutoffEntryId;
  if (conversationChanged) {
    throw new Error("The active conversation changed while the audit was running; the stale result was not presented.");
  }
  if (response.stopReason === "length") {
    throw new Error("The audit exhausted its output limit, so its incomplete result was not presented.");
  }
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage ?? `The audit stopped with ${response.stopReason}.`);
  }

  const audit = response.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!audit) throw new Error("The configured model returned an empty audit.");

  pi.sendMessage(
    {
      customType: WRAP_UP_INVENTORY_MESSAGE,
      content: buildPresentationMessage(audit),
      display: false,
    },
    { triggerTurn: true },
  );

  // sendMessage is fire-and-forget, so keep the command alive until the presentation settles.
  await ctx.waitForIdle();
}

async function loadWrapUpSettings(): Promise<ReturnType<typeof parseWrapUpModelSelection>> {
  const path = join(getAgentDir(), "settings.json");
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }

  let document: unknown;
  try {
    document = JSON.parse(contents);
  } catch {
    throw new Error(`Invalid JSON in ${path}.`);
  }
  return parseWrapUpModelSelection(document);
}
