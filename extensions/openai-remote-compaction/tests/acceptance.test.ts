import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";
import { getModel } from "@earendil-works/pi-ai/compat";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import remoteCompactionExtension from "../src/index.js";
import { COMPACTION_MARKER } from "../src/constants.js";

class MemoryCredentials implements CredentialStore {
  constructor(private readonly values = new Map<string, Credential>()) {}

  async read(providerId: string): Promise<Credential | undefined> {
    return this.values.get(providerId);
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return [...this.values].map(([providerId, credential]) => ({
      providerId,
      type: credential.type,
    }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const next = await fn(this.values.get(providerId));
    if (next) this.values.set(providerId, next);
    return next;
  }

  async delete(providerId: string): Promise<void> {
    this.values.delete(providerId);
  }
}

function jwt(): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({
    "https://api.openai.com/auth": { chatgpt_account_id: "account-1" },
  })}.signature`;
}

function normalResponse(text: string): Response {
  const item = {
    type: "message",
    id: `msg_${text}`,
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  };
  const events = [
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: {
        id: `resp_${text}`,
        status: "completed",
        output: [item],
        usage: {
          input_tokens: 10,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 2,
          total_tokens: 12,
        },
      },
    },
  ];
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function compactionResponse(value: string): Response {
  return new Response(
    `data: ${JSON.stringify({
      type: "response.completed",
      response: {
        status: "completed",
        output: [{ type: "compaction", encrypted_content: value }],
        usage: { input_tokens: 20, output_tokens: 1, total_tokens: 21 },
      },
    })}\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

async function loader(
  cwd: string,
  agentDir: string,
  settingsManager: SettingsManager,
  observedPayloads: unknown[],
): Promise<DefaultResourceLoader> {
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    extensionFactories: [
      remoteCompactionExtension,
      (pi) => {
        pi.on("before_provider_request", (event) => {
          observedPayloads.push(event.payload);
        });
      },
    ],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "You are helpful.",
  });
  await resourceLoader.reload();
  return resourceLoader;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persisted Pi acceptance lifecycle", () => {
  it("compacts, reloads, continues, and compacts the remote checkpoint again", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-remote-acceptance-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    const sessionDir = join(root, "sessions");
    const compactionBodies: Array<Record<string, unknown>> = [];
    let normalCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (headers.get("x-codex-beta-features") === "remote_compaction_v2") {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          compactionBodies.push(body);
          return compactionResponse(`opaque-${compactionBodies.length}`);
        }
        normalCount += 1;
        return normalResponse(`answer-${normalCount}`);
      }),
    );

    try {
      const credentials = new MemoryCredentials(
        new Map([
          [
            "openai-codex",
            {
              type: "oauth" as const,
              access: jwt(),
              refresh: "refresh-token",
              expires: Date.now() + 60 * 60 * 1000,
            },
          ],
        ]),
      );
      const modelRuntime = await ModelRuntime.create({ credentials, modelsPath: null });
      const model = getModel("openai-codex", "gpt-5.4-mini");
      expect(model).toBeTruthy();
      const settingsManager = SettingsManager.inMemory({
        transport: "sse",
        compaction: { enabled: true, reserveTokens: 100, keepRecentTokens: 1 },
      });
      const observedFirst: unknown[] = [];
      const firstManager = SessionManager.create(cwd, sessionDir);
      const first = await createAgentSession({
        cwd,
        agentDir,
        model: model!,
        modelRuntime,
        settingsManager,
        sessionManager: firstManager,
        resourceLoader: await loader(cwd, agentDir, settingsManager, observedFirst),
        noTools: "all",
      });

      await first.session.prompt("hello");
      await first.session.compact();
      const sessionFile = first.session.sessionFile;
      expect(sessionFile).toBeTruthy();
      const saved = first.session.sessionManager.getBranch().find((entry) => entry.type === "compaction");
      expect(saved).toMatchObject({
        type: "compaction",
        summary: COMPACTION_MARKER,
        details: {
          openaiRemoteCompaction: {
            version: 1,
            replacementHistory: [{ type: "compaction", encrypted_content: "opaque-1" }],
          },
        },
      });
      first.session.dispose();

      const observedSecond: unknown[] = [];
      const second = await createAgentSession({
        cwd,
        agentDir,
        model: model!,
        modelRuntime,
        settingsManager,
        sessionManager: SessionManager.open(sessionFile!),
        resourceLoader: await loader(cwd, agentDir, settingsManager, observedSecond),
        noTools: "all",
      });
      await second.session.prompt("continue");
      expect(
        observedSecond.some(
          (payload) =>
            Array.isArray((payload as { input?: unknown[] }).input) &&
            (payload as { input: Array<{ type?: string; encrypted_content?: string }> }).input.some(
              (item) => item.type === "compaction" && item.encrypted_content === "opaque-1",
            ),
        ),
      ).toBe(true);

      await second.session.compact();
      expect(compactionBodies).toHaveLength(2);
      expect(compactionBodies.every((body) => body.store === false && body.stream === true)).toBe(true);
      expect(compactionBodies[0].input).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "compaction_trigger" })]),
      );
      expect(compactionBodies[1].input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "compaction", encrypted_content: "opaque-1" }),
          expect.objectContaining({ type: "compaction_trigger" }),
        ]),
      );
      second.session.dispose();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reuses checkpoints only for compatible models across real Pi model changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-remote-models-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    const sessionDir = join(root, "sessions");
    const actualNow = Date.now();
    let now = actualNow;
    let catalogAvailable = true;
    let normalCount = 0;
    const compactionBodies: Array<Record<string, unknown>> = [];
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        if (target.endsWith("/models")) {
          return catalogAvailable
            ? new Response(
                JSON.stringify({
                  models: [
                    { slug: "gpt-5.4-mini", comp_hash: "family-1" },
                    { slug: "gpt-5.4", comp_hash: "family-1" },
                    { slug: "gpt-5.5", comp_hash: "family-2" },
                  ],
                }),
                { status: 200, headers: { ETag: '"catalog-1"' } },
              )
            : new Response("unavailable", { status: 503 });
        }
        const headers = new Headers(init?.headers);
        if (headers.get("x-codex-beta-features") === "remote_compaction_v2") {
          compactionBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return compactionResponse("opaque-models");
        }
        normalCount += 1;
        return normalResponse(`answer-${normalCount}`);
      }),
    );

    try {
      const credentials = new MemoryCredentials(
        new Map([
          [
            "openai-codex",
            {
              type: "oauth" as const,
              access: jwt(),
              refresh: "refresh-token",
              expires: actualNow + 60 * 60 * 1000,
            },
          ],
        ]),
      );
      const modelRuntime = await ModelRuntime.create({ credentials, modelsPath: null });
      const original = getModel("openai-codex", "gpt-5.4-mini")!;
      const compatible = getModel("openai-codex", "gpt-5.4")!;
      const incompatible = getModel("openai-codex", "gpt-5.5")!;
      const settingsManager = SettingsManager.inMemory({
        transport: "sse",
        compaction: { enabled: true, reserveTokens: 100, keepRecentTokens: 1 },
      });
      const observed: unknown[] = [];
      const created = await createAgentSession({
        cwd,
        agentDir,
        model: original,
        modelRuntime,
        settingsManager,
        sessionManager: SessionManager.create(cwd, sessionDir),
        resourceLoader: await loader(cwd, agentDir, settingsManager, observed),
        noTools: "all",
      });

      await created.session.prompt("start");
      await created.session.compact();
      expect(
        created.session.sessionManager
          .getBranch()
          .find((entry) => entry.type === "compaction"),
      ).toMatchObject({
        details: {
          openaiRemoteCompaction: { compactionCompatibilityHash: "family-1" },
        },
      });

      await created.session.setModel(compatible);
      await created.session.prompt("compatible turn");
      const compatiblePayload = observed.find(
        (payload) => (payload as { model?: string }).model === compatible.id,
      ) as { input: Array<{ type?: string; encrypted_content?: string }> };
      expect(compatiblePayload.input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "compaction", encrypted_content: "opaque-models" }),
        ]),
      );

      now += 5 * 60 * 1000 + 1;
      catalogAvailable = false;
      await created.session.setModel(incompatible);
      await created.session.prompt("incompatible turn");
      const incompatiblePayload = observed.find(
        (payload) => (payload as { model?: string }).model === incompatible.id,
      ) as { input: Array<{ type?: string }> };
      expect(incompatiblePayload.input.some((item) => item.type === "compaction")).toBe(false);

      const beforeBlockedCompaction = structuredClone(created.session.sessionManager.getBranch());
      await expect(created.session.compact()).rejects.toThrow();
      expect(created.session.sessionManager.getBranch()).toEqual(beforeBlockedCompaction);

      await created.session.setModel(original);
      await created.session.compact();
      expect(compactionBodies).toHaveLength(2);
      expect(compactionBodies[1].input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "compaction", encrypted_content: "opaque-models" }),
        ]),
      );
      expect(JSON.stringify(compactionBodies[1])).toContain("answer-3");

      await created.session.prompt("switch back");
      const restoredPayloads = observed.filter(
        (payload) => (payload as { model?: string }).model === original.id,
      ) as Array<{ input: Array<{ type?: string; encrypted_content?: string }> }>;
      const restored = restoredPayloads.at(-1)!;
      expect(restored.input).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "compaction", encrypted_content: "opaque-models" }),
        ]),
      );
      expect(JSON.stringify(restored)).toContain("answer-3");
      created.session.dispose();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps the persisted branch unchanged after retry exhaustion", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-remote-failure-"));
    const cwd = join(root, "project");
    const agentDir = join(root, "agent");
    const sessionDir = join(root, "sessions");
    let remoteAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (headers.get("x-codex-beta-features") === "remote_compaction_v2") {
          remoteAttempts += 1;
          return new Response("overloaded", {
            status: 503,
            headers: { "Retry-After": "0" },
          });
        }
        return normalResponse("answer");
      }),
    );

    try {
      const credentials = new MemoryCredentials(
        new Map([
          [
            "openai-codex",
            {
              type: "oauth" as const,
              access: jwt(),
              refresh: "refresh-token",
              expires: Date.now() + 60 * 60 * 1000,
            },
          ],
        ]),
      );
      const modelRuntime = await ModelRuntime.create({ credentials, modelsPath: null });
      const model = getModel("openai-codex", "gpt-5.4-mini");
      const settingsManager = SettingsManager.inMemory({
        transport: "sse",
        compaction: { enabled: true, reserveTokens: 100, keepRecentTokens: 1 },
      });
      const manager = SessionManager.create(cwd, sessionDir);
      const created = await createAgentSession({
        cwd,
        agentDir,
        model: model!,
        modelRuntime,
        settingsManager,
        sessionManager: manager,
        resourceLoader: await loader(cwd, agentDir, settingsManager, []),
        noTools: "all",
      });

      await created.session.prompt("hello");
      const before = structuredClone(created.session.sessionManager.getBranch());
      const sessionFile = created.session.sessionFile;
      await expect(created.session.compact()).rejects.toThrow();
      expect(remoteAttempts).toBe(3);
      expect(created.session.sessionManager.getBranch()).toEqual(before);
      created.session.dispose();

      expect(SessionManager.open(sessionFile!).getBranch()).toEqual(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
