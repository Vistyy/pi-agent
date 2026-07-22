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

export default function openAIRemoteCompaction(pi: ExtensionAPI): void {
  let latestTemplate: CodexRequestTemplate | undefined;

  pi.on("before_provider_request", (event, ctx) => {
    const model = currentCodexModel(ctx);
    if (!model || !isCodexRequestTemplate(event.payload)) return;

    const checkpoint = findActiveRemoteCheckpoint(ctx.sessionManager.getBranch());
    const input =
      checkpoint && checkpoint.creatingModelId === model.id
        ? replaceMarkerWithRemoteCheckpoint(event.payload.input ?? [], checkpoint)
        : [...(event.payload.input ?? [])];
    latestTemplate = { ...event.payload, input };
    return latestTemplate;
  });

  pi.on("session_before_compact", async (event, ctx) => {
    const model = currentCodexModel(ctx);
    if (!model) return;

    if (!latestTemplate || latestTemplate.model !== model.id) {
      ctx.ui.notify(
        "Remote compaction needs one completed Codex request before it can run.",
        "error",
      );
      return { cancel: true };
    }

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
