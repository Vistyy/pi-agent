import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModels } from "@earendil-works/pi-ai/compat";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import remoteCompactionExtension from "../../src/index.js";
import { extractAccountId } from "../../src/auth.js";
import { CodexModelCatalog } from "../../src/catalog.js";
import { findActiveRemoteCheckpoint } from "../../src/session-state.js";

const live = process.env.PI_REMOTE_COMPACTION_LIVE === "1" ? describe : describe.skip;

live("live Codex remote compaction", () => {
  it("compacts, repeats, resumes, navigates, and exercises available model compatibility", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-remote-live-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    const sessionDir = join(root, "sessions");
    const actualAgentDir = getAgentDir();
    const realFetch = globalThis.fetch.bind(globalThis);
    const remoteBodies: Array<Record<string, unknown>> = [];
    let failRemoteCompaction = false;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (headers.get("x-codex-beta-features") === "remote_compaction_v2") {
        remoteBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (failRemoteCompaction) {
          return new Response("live injected server failure", {
            status: 503,
            headers: { "Retry-After": "0" },
          });
        }
      }
      return realFetch(input, init);
    });
    const modelRuntime = await ModelRuntime.create({
      authPath: join(actualAgentDir, "auth.json"),
      modelsPath: join(actualAgentDir, "models.json"),
    });
    const modelId = process.env.PI_REMOTE_COMPACTION_MODEL ?? "gpt-5.4-mini";
    const availableModels = getModels("openai-codex");
    const initialModel = availableModels.find((model) => model.id === modelId);
    if (!initialModel) throw new Error(`Unknown live Codex model: ${modelId}`);
    const settingsManager = SettingsManager.inMemory({
      transport: "sse",
      compaction: { enabled: true, reserveTokens: 256, keepRecentTokens: 1 },
    });
    const makeLoader = async () => {
      const loader = new DefaultResourceLoader({
        cwd,
        agentDir,
        settingsManager,
        extensionFactories: [remoteCompactionExtension],
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPrompt: "Reply briefly and follow the user's exact requested text when possible.",
      });
      await loader.reload();
      return loader;
    };

    try {
      const first = await createAgentSession({
        cwd,
        agentDir,
        model: initialModel,
        modelRuntime,
        settingsManager,
        sessionManager: SessionManager.create(cwd, sessionDir),
        resourceLoader: await makeLoader(),
        noTools: "all",
      });
      await first.session.prompt("Reply with exactly LIVE-INITIAL-OK.");
      await first.session.compact();
      const firstCheckpoint = findActiveRemoteCheckpoint(first.session.sessionManager.getBranch());
      expect(firstCheckpoint?.replacementHistory[0]).toMatchObject({
        type: "compaction",
        encrypted_content: expect.any(String),
      });

      await first.session.prompt("Reply with exactly LIVE-REPEAT-OK.");
      await first.session.compact();
      const repeatedCheckpoint = findActiveRemoteCheckpoint(first.session.sessionManager.getBranch());
      expect(repeatedCheckpoint).toBeDefined();
      const sessionFile = first.session.sessionFile!;
      first.session.dispose();

      const resumed = await createAgentSession({
        cwd,
        agentDir,
        model: initialModel,
        modelRuntime,
        settingsManager,
        sessionManager: SessionManager.open(sessionFile),
        resourceLoader: await makeLoader(),
        noTools: "all",
      });
      await resumed.session.prompt("Reply with exactly LIVE-RESUME-OK.");
      const checkpointEntry = [...resumed.session.sessionManager.getBranch()]
        .reverse()
        .find((entry) => entry.type === "compaction");
      expect(checkpointEntry).toBeDefined();
      await resumed.session.navigateTree(checkpointEntry!.id, { summarize: false });
      await resumed.session.prompt("Reply with exactly LIVE-TREE-OK.");
      expect(findActiveRemoteCheckpoint(resumed.session.sessionManager.getBranch())).toBeDefined();

      const authResult = await modelRuntime.getAuth("openai-codex");
      const token = authResult?.auth.apiKey;
      if (!token) throw new Error("Codex OAuth is unavailable for live validation");
      const auth = { token, accountId: extractAccountId(token), headers: authResult.auth.headers };
      const catalog = new CodexModelCatalog();
      const checkpoint = findActiveRemoteCheckpoint(resumed.session.sessionManager.getBranch())!;
      const models = availableModels;
      const hashes = new Map<string, string | undefined>();
      for (const model of models) hashes.set(model.id, await catalog.getHash(model.id, auth));
      const compatible = models.find(
        (model) =>
          model.id !== initialModel.id &&
          checkpoint.compactionCompatibilityHash !== undefined &&
          hashes.get(model.id) === checkpoint.compactionCompatibilityHash,
      );
      if (compatible) {
        await resumed.session.setModel(compatible);
        await resumed.session.prompt("Reply with exactly LIVE-COMPATIBLE-OK.");
      }
      const incompatible = models.find(
        (model) =>
          model.id !== initialModel.id &&
          hashes.get(model.id) !== undefined &&
          checkpoint.compactionCompatibilityHash !== undefined &&
          hashes.get(model.id) !== checkpoint.compactionCompatibilityHash,
      );
      if (incompatible) {
        await resumed.session.setModel(incompatible);
        await resumed.session.prompt("Reply with exactly LIVE-INCOMPATIBLE-OK.");
        await expect(resumed.session.compact()).rejects.toThrow();
        await resumed.session.setModel(initialModel);
        await resumed.session.prompt("Reply with exactly LIVE-RESTORED-OK.");
        expect(findActiveRemoteCheckpoint(resumed.session.sessionManager.getBranch())).toBeDefined();
      }

      const beforeFailure = structuredClone(resumed.session.sessionManager.getBranch());
      failRemoteCompaction = true;
      await expect(resumed.session.compact()).rejects.toThrow();
      expect(resumed.session.sessionManager.getBranch()).toEqual(beforeFailure);
      expect(remoteBodies.length).toBeGreaterThan(0);
      expect(remoteBodies.every((body) => body.store === false)).toBe(true);
      resumed.session.dispose();
    } finally {
      vi.unstubAllGlobals();
      await rm(root, { recursive: true, force: true });
    }
  });
});
