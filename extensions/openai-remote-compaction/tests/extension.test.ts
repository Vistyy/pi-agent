import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import remoteCompactionExtension from "../src/index.js";
import { COMPACTION_MARKER } from "../src/constants.js";

function jwt(): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({
    "https://api.openai.com/auth": { chatgpt_account_id: "account-1" },
  })}.signature`;
}

function apiHarness() {
  const handlers = new Map<string, (event: any, ctx: any) => any>();
  return {
    api: {
      on: vi.fn((name: string, handler: (event: any, ctx: any) => any) => handlers.set(name, handler)),
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
    },
    handlers,
  };
}

function branch(): SessionEntry[] {
  return [
    {
      type: "message",
      id: "user-1",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: "hello", timestamp: 1 },
    },
    {
      type: "message",
      id: "assistant-1",
      parentId: "user-1",
      timestamp: "2026-01-01T00:00:01.000Z",
      message: {
        role: "assistant",
        api: "openai-codex-responses",
        provider: "openai-codex",
        model: "gpt-test",
        content: [{ type: "text", text: "hi" }],
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 2,
      },
    },
  ];
}

function context(entries: SessionEntry[]) {
  return {
    model: {
      provider: "openai-codex",
      id: "gpt-test",
      api: "openai-codex-responses",
      name: "Test Codex",
      baseUrl: "https://chatgpt.com/backend-api",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 100_000,
      maxTokens: 10_000,
    },
    modelRegistry: {
      getProviderAuth: vi.fn(async () => ({ auth: { apiKey: jwt() } })),
    },
    sessionManager: {
      getBranch: vi.fn(() => entries),
      getSessionId: vi.fn(() => "session-1"),
      getLeafId: vi.fn(() => entries.at(-1)?.id ?? null),
    },
    ui: { notify: vi.fn() },
    getSystemPrompt: vi.fn(() => "You are helpful."),
  };
}

function successfulSSE(): Response {
  return new Response(
    `data: ${JSON.stringify({
      type: "response.completed",
      response: {
        output: [{ type: "compaction", encrypted_content: "opaque" }],
        usage: { input_tokens: 12, output_tokens: 2, total_tokens: 14 },
      },
    })}\n\n`,
    { status: 200 },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("remote compaction extension lifecycle", () => {
  it("compacts a Codex branch and injects the saved checkpoint into later requests", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => successfulSSE()));
    const { api, handlers } = apiHarness();
    remoteCompactionExtension(api as any);
    const entries = branch();
    const ctx = context(entries);

    await handlers.get("before_provider_request")?.(
      {
        payload: {
          model: "gpt-test",
          instructions: "Be precise.",
          input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
          reasoning: { effort: "high", summary: "auto" },
          text: { verbosity: "low" },
          store: false,
          stream: true,
        },
      },
      ctx,
    );

    await handlers.get("turn_end")?.(
      { message: entries[1].type === "message" ? entries[1].message : undefined },
      ctx,
    );

    const result = await handlers.get("session_before_compact")?.(
      {
        branchEntries: entries,
        preparation: { firstKeptEntryId: "assistant-1", tokensBefore: 14 },
        reason: "manual",
        signal: new AbortController().signal,
      },
      ctx,
    );

    expect(result.compaction).toMatchObject({
      summary: COMPACTION_MARKER,
      firstKeptEntryId: "assistant-1",
      tokensBefore: 14,
      details: {
        openaiRemoteCompaction: {
          version: 1,
          replacementHistory: [{ type: "compaction", encrypted_content: "opaque" }],
          creatingModelId: "gpt-test",
        },
      },
      usage: { input: 12, output: 2, totalTokens: 14 },
    });

    const compactedBranch = [
      ...entries,
      {
        type: "compaction",
        id: "compaction-1",
        parentId: "assistant-1",
        timestamp: "2026-01-01T00:00:02.000Z",
        ...result.compaction,
      },
    ] as SessionEntry[];
    const compactedContext = context(compactedBranch);
    const markerText = `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${COMPACTION_MARKER}\n</summary>`;

    const nextPayload = await handlers.get("before_provider_request")?.(
      {
        payload: {
          model: "gpt-test",
          input: [
            { role: "user", content: [{ type: "input_text", text: markerText }] },
            { role: "user", content: [{ type: "input_text", text: "continue" }] },
          ],
        },
      },
      compactedContext,
    );

    expect(nextPayload.input).toEqual([
      { type: "compaction", encrypted_content: "opaque" },
      { role: "user", content: [{ type: "input_text", text: "continue" }] },
    ]);
  });

  it("leaves the branch unchanged when remote compaction fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    const { api, handlers } = apiHarness();
    remoteCompactionExtension(api as any);
    const entries = branch();
    const original = structuredClone(entries);
    const ctx = context(entries);

    await handlers.get("before_provider_request")?.(
      { payload: { model: "gpt-test", input: [] } },
      ctx,
    );
    await handlers.get("turn_end")?.(
      { message: entries[1].type === "message" ? entries[1].message : undefined },
      ctx,
    );
    const result = await handlers.get("session_before_compact")?.(
      {
        branchEntries: entries,
        preparation: { firstKeptEntryId: "assistant-1", tokensBefore: 14 },
        reason: "manual",
        signal: new AbortController().signal,
      },
      ctx,
    );

    expect(result).toEqual({ cancel: true });
    expect(entries).toEqual(original);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Remote compaction failed"),
      "error",
    );
  });

  it("does not compact manually from an uncompleted or different-branch request", async () => {
    const { api, handlers } = apiHarness();
    remoteCompactionExtension(api as any);
    const entries = branch();
    const ctx = context(entries);

    await handlers.get("before_provider_request")?.(
      { payload: { model: "gpt-test", input: [] } },
      ctx,
    );

    const result = await handlers.get("session_before_compact")?.(
      {
        branchEntries: entries.slice(0, 1),
        preparation: { firstKeptEntryId: "user-1", tokensBefore: 1 },
        reason: "manual",
        signal: new AbortController().signal,
      },
      ctx,
    );

    expect(result).toEqual({ cancel: true });
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("completed Codex request on this branch"),
      "error",
    );
  });

  it("does not replace Pi behavior for a fresh non-Codex branch", async () => {
    const { api, handlers } = apiHarness();
    remoteCompactionExtension(api as any);
    const ctx = { ...context(branch()), model: { provider: "anthropic", id: "claude" } };

    expect(
      await handlers.get("session_before_compact")?.(
        {
          branchEntries: branch(),
          preparation: { firstKeptEntryId: "assistant-1", tokensBefore: 14 },
          signal: new AbortController().signal,
        },
        ctx,
      ),
    ).toBeUndefined();
  });
});
