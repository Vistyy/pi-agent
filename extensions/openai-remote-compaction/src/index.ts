import {
  convertToLlm,
  type ExtensionAPI,
  type ExtensionContext,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { extractAccountId, type CodexAuth } from "./auth.js";
import { CodexModelCatalog, checkpointIsCompatible } from "./catalog.js";
import {
  CODEX_PROVIDER,
  COMPACTION_MARKER,
  REMOTE_COMPACTION_COMPLETED_EVENT,
} from "./constants.js";
import { convertCodexMessages } from "./messages.js";
import { requestRemoteCompaction } from "./remote.js";
import {
  buildRemoteCompactionRequest,
  buildToolsPayload,
  compactionSummaryItem,
  isCodexResponsesPayload,
  replaceMarkerWithRemoteCheckpoint,
} from "./request.js";
import { findActiveRemoteCheckpoint, isRemoteCheckpoint } from "./session-state.js";
import type { OpenAIRemoteCheckpointEntryDetails } from "./types.js";
import { createUsageRecord } from "./usage.js";

type CodexModel = {
  provider: string;
  id: string;
  input?: readonly string[];
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<string, string | null>>;
};

function currentCodexModel(ctx: { model?: CodexModel }): CodexModel | undefined {
  return ctx.model?.provider === CODEX_PROVIDER ? ctx.model : undefined;
}

async function resolveCodexAuth(ctx: Pick<ExtensionContext, "modelRegistry">): Promise<CodexAuth | undefined> {
  const result = await ctx.modelRegistry.getProviderAuth(CODEX_PROVIDER);
  const token = result?.auth.apiKey;
  if (!token) return undefined;
  try {
    return {
      token,
      accountId: extractAccountId(token),
      headers: result.auth.headers,
    };
  } catch {
    return undefined;
  }
}

function sessionKey(ctx: { sessionManager: { getSessionId(): string } }): string {
  return ctx.sessionManager.getSessionId();
}

export default function openAIRemoteCompaction(pi: ExtensionAPI): void {
  const catalog = new CodexModelCatalog();
  const piCompactionBypasses = new Set<string>();

  pi.registerCommand("compact-pi", {
    description: "End the remote checkpoint chain with ordinary Pi compaction",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const checkpoint = findActiveRemoteCheckpoint(ctx.sessionManager.getBranch());
      const confirmed = await ctx.ui.confirm(
        "End the OpenAI remote checkpoint chain?",
        checkpoint
          ? "Ordinary Pi compaction cannot include history stored only in the remote checkpoint. Older remote history will become unavailable."
          : "Run ordinary Pi compaction for the current visible context?",
      );
      if (!confirmed) return;

      const key = sessionKey(ctx);
      piCompactionBypasses.add(key);
      ctx.compact({
        onError: () => piCompactionBypasses.delete(key),
      });
    },
  });

  pi.on("before_provider_request", async (event, ctx) => {
    const model = currentCodexModel(ctx);
    if (!model || !isCodexResponsesPayload(event.payload)) return;

    const checkpoint = findActiveRemoteCheckpoint(ctx.sessionManager.getBranch());
    if (!checkpoint) return;

    const auth = await resolveCodexAuth(ctx);
    const currentHash = auth ? await catalog.getHash(model.id, auth) : undefined;
    if (!checkpointIsCompatible(checkpoint, currentHash)) return;

    return {
      ...event.payload,
      input: replaceMarkerWithRemoteCheckpoint(event.payload.input, checkpoint),
    };
  });

  pi.on("model_select", (event, ctx) => {
    const checkpoint = findActiveRemoteCheckpoint(ctx.sessionManager.getBranch());
    if (!checkpoint) return;
    if (event.model.provider !== CODEX_PROVIDER) {
      ctx.ui.notify(
        "The selected model cannot read the active OpenAI remote checkpoint. Only the visible tail is available.",
        "warning",
      );
      return;
    }

    const notifyIfIncompatible = (currentHash: string | undefined) => {
      if (!checkpointIsCompatible(checkpoint, currentHash)) {
        ctx.ui.notify(
          "The selected Codex model is not compatible with the active remote checkpoint. Only the visible tail is available.",
          "warning",
        );
      }
    };
    const cachedHash = catalog.peekHash(event.model.id);
    if (cachedHash !== undefined) {
      notifyIfIncompatible(cachedHash);
      return;
    }

    void resolveCodexAuth(ctx)
      .then((auth) => (auth ? catalog.getHash(event.model.id, auth) : undefined))
      .then(notifyIfIncompatible)
      .catch(() => notifyIfIncompatible(undefined));
  });

  pi.on("session_compact", (event) => {
    const container = event.compactionEntry.details as
      | Partial<OpenAIRemoteCheckpointEntryDetails>
      | undefined;
    const details = container?.openaiRemoteCheckpoint;
    if (!isRemoteCheckpoint(details)) return;
    pi.appendEntry(
      "pi.usage.recorded",
      createUsageRecord(details.creatingModelId, event.compactionEntry.usage),
    );
    pi.events.emit(REMOTE_COMPACTION_COMPLETED_EVENT, undefined);
  });

  pi.on("session_before_compact", async (event, ctx) => {
    const key = sessionKey(ctx);
    if (piCompactionBypasses.delete(key)) return;

    const branch = event.branchEntries as SessionEntry[];
    const activeCheckpoint = findActiveRemoteCheckpoint(branch);
    const model = currentCodexModel(ctx);
    if (event.customInstructions?.trim() && (model || activeCheckpoint)) {
      ctx.ui.notify("Custom instructions are not supported by OpenAI remote compaction.", "error");
      return { cancel: true };
    }
    if (!model) {
      if (!activeCheckpoint) return;
      ctx.ui.notify(
        "Compaction is blocked because this model cannot read the active OpenAI remote checkpoint. Select a compatible Codex model or run /compact-pi.",
        "error",
      );
      return { cancel: true };
    }

    const auth = await resolveCodexAuth(ctx);
    const currentHash = auth ? await catalog.getHash(model.id, auth) : undefined;
    if (activeCheckpoint && !checkpointIsCompatible(activeCheckpoint, currentHash)) {
      ctx.ui.notify(
        "Compaction is blocked because this Codex model is not compatible with the active remote checkpoint. Select a compatible model or run /compact-pi.",
        "error",
      );
      return { cancel: true };
    }
    if (!auth) {
      ctx.ui.notify("Remote compaction could not resolve Codex OAuth.", "error");
      return { cancel: true };
    }

    try {
      const messagesToCompact = [
        ...(event.preparation.messagesToSummarize ?? []),
        ...(event.preparation.turnPrefixMessages ?? []),
      ];
      const converted = convertCodexMessages(model, convertToLlm(messagesToCompact));
      const input = activeCheckpoint
        ? [...activeCheckpoint.replacementHistory, ...converted]
        : event.preparation.previousSummary
          ? [compactionSummaryItem(event.preparation.previousSummary), ...converted]
          : converted;
      const body = buildRemoteCompactionRequest(
        {
          model,
          instructions: ctx.getSystemPrompt(),
          tools: buildToolsPayload(pi.getAllTools(), pi.getActiveTools()),
          thinkingLevel: pi.getThinkingLevel(),
          sessionId: ctx.sessionManager.getSessionId(),
        },
        input,
      );
      const remote = await requestRemoteCompaction({
        token: auth.token,
        authHeaders: auth.headers,
        body,
        signal: event.signal,
        sessionId: ctx.sessionManager.getSessionId(),
      });
      const details: OpenAIRemoteCheckpointEntryDetails = {
        openaiRemoteCheckpoint: {
          replacementHistory: remote.replacementHistory,
          creatingModelId: model.id,
          ...(currentHash ? { compactionCompatibilityHash: currentHash } : {}),
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
