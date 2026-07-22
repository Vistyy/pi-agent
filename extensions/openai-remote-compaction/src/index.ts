import { convertResponsesMessages } from "@earendil-works/pi-ai/api/openai-responses-shared";
import {
  buildSessionContext,
  convertToLlm,
  type ExtensionAPI,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { CODEX_PROVIDER, COMPACTION_MARKER } from "./constants.js";
import {
  buildRemoteCompactionRequest,
  captureContinuationSettings,
  isCodexRequestTemplate,
  replaceMarkerWithRemoteCheckpoint,
} from "./request.js";
import { requestRemoteCompaction } from "./remote.js";
import { findActiveRemoteCheckpoint } from "./session-state.js";
import type {
  CodexRequestTemplate,
  OpenAIRemoteCompactionEntryDetails,
  ResponseItem,
} from "./types.js";

const CODEX_TOOL_CALL_PROVIDERS = new Set(["openai", "openai-codex", "opencode"]);

function currentCodexModel(ctx: { model?: { provider: string; id: string } }):
  | { provider: string; id: string }
  | undefined {
  return ctx.model?.provider === CODEX_PROVIDER ? ctx.model : undefined;
}

interface ScopedTemplate {
  template: CodexRequestTemplate;
  modelId: string;
  branchAnchorId: string | null;
}

function sessionKey(ctx: { sessionManager: { getSessionId(): string } }): string {
  return ctx.sessionManager.getSessionId();
}

function belongsToBranch(scoped: ScopedTemplate, branch: readonly SessionEntry[]): boolean {
  return scoped.branchAnchorId === null || branch.some((entry) => entry.id === scoped.branchAnchorId);
}

export default function openAIRemoteCompaction(pi: ExtensionAPI): void {
  const pendingTemplates = new Map<string, ScopedTemplate>();
  const completedTemplates = new Map<string, ScopedTemplate>();

  pi.on("before_provider_request", (event, ctx) => {
    const model = currentCodexModel(ctx);
    if (!model || !isCodexRequestTemplate(event.payload)) return;

    const checkpoint = findActiveRemoteCheckpoint(ctx.sessionManager.getBranch());
    const input =
      checkpoint && checkpoint.creatingModelId === model.id
        ? replaceMarkerWithRemoteCheckpoint(event.payload.input ?? [], checkpoint)
        : [...(event.payload.input ?? [])];
    const template = { ...event.payload, input };
    pendingTemplates.set(sessionKey(ctx), {
      template,
      modelId: model.id,
      branchAnchorId: ctx.sessionManager.getLeafId(),
    });
    return template;
  });

  pi.on("turn_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (event.message.stopReason === "error" || event.message.stopReason === "aborted") return;
    const key = sessionKey(ctx);
    const pending = pendingTemplates.get(key);
    if (!pending || !belongsToBranch(pending, ctx.sessionManager.getBranch())) return;
    completedTemplates.set(key, pending);
    pendingTemplates.delete(key);
  });

  pi.on("session_before_compact", async (event, ctx) => {
    const model = currentCodexModel(ctx);
    if (!model) return;

    const branch = event.branchEntries as SessionEntry[];
    const key = sessionKey(ctx);
    const scopedTemplate =
      event.reason === "overflow" ? pendingTemplates.get(key) ?? completedTemplates.get(key) : completedTemplates.get(key);
    if (
      !scopedTemplate ||
      scopedTemplate.modelId !== model.id ||
      !belongsToBranch(scopedTemplate, branch)
    ) {
      ctx.ui.notify(
        "Remote compaction needs one completed Codex request on this branch before it can run.",
        "error",
      );
      return { cancel: true };
    }
    const latestTemplate = scopedTemplate.template;

    const auth = await ctx.modelRegistry.getProviderAuth(CODEX_PROVIDER);
    const token = auth?.auth.apiKey;
    if (!token) {
      ctx.ui.notify("Remote compaction could not resolve Codex OAuth.", "error");
      return { cancel: true };
    }

    try {
      const sessionContext = buildSessionContext(event.branchEntries as SessionEntry[]);
      const messages = convertToLlm(sessionContext.messages);
      const converted = convertResponsesMessages(
        ctx.model as Parameters<typeof convertResponsesMessages>[0],
        { systemPrompt: ctx.getSystemPrompt(), messages },
        CODEX_TOOL_CALL_PROVIDERS,
        { includeSystemPrompt: false },
      ) as unknown as ResponseItem[];
      const activeCheckpoint = findActiveRemoteCheckpoint(event.branchEntries);
      const input =
        activeCheckpoint && activeCheckpoint.creatingModelId === model.id
          ? replaceMarkerWithRemoteCheckpoint(converted, activeCheckpoint)
          : converted;
      const body = buildRemoteCompactionRequest(latestTemplate, input);
      const remote = await requestRemoteCompaction({
        token,
        authHeaders: auth.auth.headers,
        body,
        signal: event.signal,
        sessionId: ctx.sessionManager.getSessionId(),
      });
      const details: OpenAIRemoteCompactionEntryDetails = {
        openaiRemoteCompaction: {
          version: 1,
          replacementHistory: remote.replacementHistory,
          creatingModelId: model.id,
          continuationSettings: captureContinuationSettings(latestTemplate),
        },
      };

      return {
        compaction: {
          summary: COMPACTION_MARKER,
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          ...(remote.usage ? { usage: remote.usage } : {}),
          details,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Remote compaction failed: ${message}`, "error");
      return { cancel: true };
    }
  });
}
