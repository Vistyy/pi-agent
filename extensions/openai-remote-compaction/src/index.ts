import {
  buildSessionContext,
  convertToLlm,
  type ExtensionAPI,
  type ExtensionContext,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { extractAccountId, type CodexAuth } from "./auth.js";
import { CodexModelCatalog, checkpointIsCompatible } from "./catalog.js";
import { CODEX_PROVIDER, COMPACTION_MARKER } from "./constants.js";
import {
  buildRemoteCompactionRequest,
  captureContinuationSettings,
  isCodexRequestTemplate,
  replaceMarkerWithRemoteCheckpoint,
} from "./request.js";
import { convertCodexMessages } from "./messages.js";
import { requestRemoteCompaction } from "./remote.js";
import { findActiveRemoteCheckpoint, isRemoteCompactionDetails } from "./session-state.js";
import type {
  CodexRequestTemplate,
  OpenAIRemoteCompactionEntryDetails,
} from "./types.js";
import { createUsageRecord } from "./usage.js";

function currentCodexModel(ctx: { model?: { provider: string; id: string; input?: readonly string[] } }):
  | { provider: string; id: string; input?: readonly string[] }
  | undefined {
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

interface ScopedTemplate {
  template: CodexRequestTemplate;
  modelId: string;
  branchAnchorId: string | null;
}

function sessionKey(ctx: { sessionManager: { getSessionId(): string } }): string {
  return ctx.sessionManager.getSessionId();
}

function modelTemplateKey(sessionId: string, modelId: string): string {
  return `${sessionId}\u0000${modelId}`;
}

function belongsToBranch(scoped: ScopedTemplate, branch: readonly SessionEntry[]): boolean {
  return scoped.branchAnchorId === null || branch.some((entry) => entry.id === scoped.branchAnchorId);
}

export default function openAIRemoteCompaction(pi: ExtensionAPI): void {
  const catalog = new CodexModelCatalog();
  const pendingTemplates = new Map<string, ScopedTemplate>();
  const completedTemplates = new Map<string, ScopedTemplate>();
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
    if (!model || !isCodexRequestTemplate(event.payload)) return;

    const checkpoint = findActiveRemoteCheckpoint(ctx.sessionManager.getBranch());
    let compatible = false;
    if (checkpoint) {
      const auth = await resolveCodexAuth(ctx);
      const currentHash = auth ? await catalog.getHash(model.id, auth) : undefined;
      compatible = checkpointIsCompatible(checkpoint, model.id, currentHash);
    }
    const input =
      checkpoint && compatible
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
      if (!checkpointIsCompatible(checkpoint, event.model.id, currentHash)) {
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

  pi.on("turn_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    if (event.message.stopReason === "error" || event.message.stopReason === "aborted") return;
    const key = sessionKey(ctx);
    const pending = pendingTemplates.get(key);
    if (!pending || !belongsToBranch(pending, ctx.sessionManager.getBranch())) return;
    completedTemplates.set(modelTemplateKey(key, pending.modelId), pending);
    pendingTemplates.delete(key);
  });

  pi.on("session_compact", (event) => {
    const container = event.compactionEntry.details as
      | Partial<OpenAIRemoteCompactionEntryDetails>
      | undefined;
    const details = container?.openaiRemoteCompaction;
    if (!isRemoteCompactionDetails(details)) return;
    pi.appendEntry(
      "pi.usage.recorded",
      createUsageRecord(details.creatingModelId, event.compactionEntry.usage),
    );
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

    let auth = await resolveCodexAuth(ctx);
    const currentHash = auth ? await catalog.getHash(model.id, auth) : undefined;
    if (activeCheckpoint && !checkpointIsCompatible(activeCheckpoint, model.id, currentHash)) {
      ctx.ui.notify(
        "Compaction is blocked because this Codex model is not compatible with the active remote checkpoint. Select a compatible model or run /compact-pi.",
        "error",
      );
      return { cancel: true };
    }

    const completedTemplate = completedTemplates.get(modelTemplateKey(key, model.id));
    const scopedTemplate =
      event.reason === "overflow" ? pendingTemplates.get(key) ?? completedTemplate : completedTemplate;
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

    if (!auth) {
      ctx.ui.notify("Remote compaction could not resolve Codex OAuth.", "error");
      return { cancel: true };
    }

    try {
      const sessionContext = buildSessionContext(event.branchEntries as SessionEntry[]);
      const messages = convertToLlm(sessionContext.messages);
      const converted = convertCodexMessages(model, messages);
      const input = activeCheckpoint
        ? replaceMarkerWithRemoteCheckpoint(converted, activeCheckpoint)
        : converted;
      const body = buildRemoteCompactionRequest(latestTemplate, input);
      const remote = await requestRemoteCompaction({
        token: auth.token,
        authHeaders: auth.headers,
        body,
        signal: event.signal,
        sessionId: ctx.sessionManager.getSessionId(),
      });
      const details: OpenAIRemoteCompactionEntryDetails = {
        openaiRemoteCompaction: {
          version: 1,
          replacementHistory: remote.replacementHistory,
          creatingModelId: model.id,
          ...(currentHash ? { compactionCompatibilityHash: currentHash } : {}),
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
