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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("remote compaction extension lifecycle", () => {
  it("compacts a Codex branch and injects the saved checkpoint into later requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/models")
          ? new Response(
              JSON.stringify({ models: [{ slug: "gpt-test", comp_hash: "family-1" }] }),
              { status: 200 },
            )
          : successfulSSE(),
      ),
    );
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
          compactionCompatibilityHash: "family-1",
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

  it("preserves the branch after retry exhaustion", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/models")
        ? new Response(JSON.stringify({ models: [] }), { status: 200 })
        : new Response("overloaded", { status: 503, headers: { "Retry-After": "0" } }),
    );
    vi.stubGlobal("fetch", fetch);
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

    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/responses"))).toHaveLength(3);
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

  it("reuses a checkpoint across model IDs only when comp_hash matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            models: [
              { slug: "gpt-compatible", comp_hash: "family-1" },
              { slug: "gpt-incompatible", comp_hash: "family-2" },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const markerText = `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${COMPACTION_MARKER}\n</summary>`;
    const entries = [
      ...branch(),
      {
        type: "compaction",
        id: "compaction-1",
        parentId: "assistant-1",
        timestamp: "2026-01-01T00:00:02.000Z",
        summary: COMPACTION_MARKER,
        firstKeptEntryId: "assistant-1",
        tokensBefore: 14,
        details: {
          openaiRemoteCompaction: {
            version: 1,
            replacementHistory: [{ type: "compaction", encrypted_content: "opaque" }],
            creatingModelId: "gpt-original",
            compactionCompatibilityHash: "family-1",
            continuationSettings: {},
          },
        },
      },
    ] as SessionEntry[];

    const compatibleHarness = apiHarness();
    remoteCompactionExtension(compatibleHarness.api as any);
    const compatibleContext = {
      ...context(entries),
      model: { ...context(entries).model, id: "gpt-compatible" },
    };
    const compatible = await compatibleHarness.handlers.get("before_provider_request")?.(
      {
        payload: {
          model: "gpt-compatible",
          input: [{ role: "user", content: [{ type: "input_text", text: markerText }] }],
        },
      },
      compatibleContext,
    );
    expect(compatible.input).toEqual([{ type: "compaction", encrypted_content: "opaque" }]);

    const incompatibleHarness = apiHarness();
    remoteCompactionExtension(incompatibleHarness.api as any);
    const incompatibleContext = {
      ...context(entries),
      model: { ...context(entries).model, id: "gpt-incompatible" },
    };
    const incompatible = await incompatibleHarness.handlers.get("before_provider_request")?.(
      {
        payload: {
          model: "gpt-incompatible",
          input: [{ role: "user", content: [{ type: "input_text", text: markerText }] }],
        },
      },
      incompatibleContext,
    );
    expect(incompatible.input).toEqual([
      { role: "user", content: [{ type: "input_text", text: markerText }] },
    ]);
    await incompatibleHarness.handlers.get("model_select")?.(
      { model: incompatibleContext.model },
      incompatibleContext,
    );
    expect(incompatibleContext.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("not compatible"),
      "warning",
    );
  });

  it("does not wait for catalog refresh during model selection", async () => {
    let finishFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Promise<Response>((resolve) => {
            finishFetch = resolve;
          }),
      ),
    );
    const entries = [
      {
        type: "compaction",
        id: "compaction-1",
        parentId: null,
        timestamp: "2026-01-01T00:00:02.000Z",
        summary: COMPACTION_MARKER,
        firstKeptEntryId: "compaction-1",
        tokensBefore: 14,
        details: {
          openaiRemoteCompaction: {
            version: 1,
            replacementHistory: [{ type: "compaction", encrypted_content: "opaque" }],
            creatingModelId: "gpt-original",
            compactionCompatibilityHash: "family-1",
            continuationSettings: {},
          },
        },
      },
    ] as SessionEntry[];
    const { api, handlers } = apiHarness();
    remoteCompactionExtension(api as any);
    const ctx = { ...context(entries), model: { ...context(entries).model, id: "gpt-other" } };

    const result = handlers.get("model_select")?.({ model: ctx.model }, ctx);
    expect(result).toBeUndefined();
    await vi.waitFor(() => expect(finishFetch).toBeTypeOf("function"));
    finishFetch?.(
      new Response(
        JSON.stringify({ models: [{ slug: "gpt-other", comp_hash: "family-2" }] }),
        { status: 200 },
      ),
    );
    await vi.waitFor(() =>
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("not compatible"), "warning"),
    );
  });

  it("refreshes expired compatibility evidence before warning", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ models: [{ slug: "gpt-other", comp_hash: "family-1" }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ models: [{ slug: "gpt-other", comp_hash: "family-2" }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const entries = [
      {
        type: "compaction",
        id: "compaction-1",
        parentId: null,
        timestamp: "2026-01-01T00:00:02.000Z",
        summary: COMPACTION_MARKER,
        firstKeptEntryId: "compaction-1",
        tokensBefore: 14,
        details: {
          openaiRemoteCompaction: {
            version: 1,
            replacementHistory: [{ type: "compaction", encrypted_content: "opaque" }],
            creatingModelId: "gpt-original",
            compactionCompatibilityHash: "family-1",
            continuationSettings: {},
          },
        },
      },
    ] as SessionEntry[];
    const { api, handlers } = apiHarness();
    remoteCompactionExtension(api as any);
    const ctx = { ...context(entries), model: { ...context(entries).model, id: "gpt-other" } };
    const markerText = `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${COMPACTION_MARKER}\n</summary>`;

    await handlers.get("before_provider_request")?.(
      {
        payload: {
          model: "gpt-other",
          input: [{ role: "user", content: [{ type: "input_text", text: markerText }] }],
        },
      },
      ctx,
    );
    expect(fetch).toHaveBeenCalledOnce();

    now = 5 * 60 * 1000 + 1;
    expect(handlers.get("model_select")?.({ model: ctx.model }, ctx)).toBeUndefined();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("not compatible"), "warning"),
    );
  });

  it("blocks compaction while an incompatible model is active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ models: [{ slug: "gpt-other", comp_hash: "family-2" }] }),
          { status: 200 },
        ),
      ),
    );
    const entries = [
      ...branch(),
      {
        type: "compaction",
        id: "compaction-1",
        parentId: "assistant-1",
        timestamp: "2026-01-01T00:00:02.000Z",
        summary: COMPACTION_MARKER,
        firstKeptEntryId: "assistant-1",
        tokensBefore: 14,
        details: {
          openaiRemoteCompaction: {
            version: 1,
            replacementHistory: [{ type: "compaction", encrypted_content: "opaque" }],
            creatingModelId: "gpt-original",
            compactionCompatibilityHash: "family-1",
            continuationSettings: {},
          },
        },
      },
    ] as SessionEntry[];
    const { api, handlers } = apiHarness();
    remoteCompactionExtension(api as any);
    const ctx = { ...context(entries), model: { ...context(entries).model, id: "gpt-other" } };

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
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("blocked"), "error");

    const nonCodex = { ...context(entries), model: { provider: "anthropic", id: "claude" } };
    await handlers.get("model_select")?.({ model: nonCodex.model }, nonCodex);
    expect(nonCodex.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("cannot read"),
      "warning",
    );
    await expect(
      handlers.get("session_before_compact")?.(
        {
          branchEntries: entries,
          preparation: { firstKeptEntryId: "assistant-1", tokensBefore: 14 },
          reason: "manual",
          signal: new AbortController().signal,
        },
        nonCodex,
      ),
    ).resolves.toEqual({ cancel: true });
  });

  it("restores the checkpoint and keeps intervening plaintext after switching back", async () => {
    const { api, handlers } = apiHarness();
    remoteCompactionExtension(api as any);
    const entries = [
      ...branch(),
      {
        type: "compaction",
        id: "compaction-1",
        parentId: "assistant-1",
        timestamp: "2026-01-01T00:00:02.000Z",
        summary: COMPACTION_MARKER,
        firstKeptEntryId: "assistant-1",
        tokensBefore: 14,
        details: {
          openaiRemoteCompaction: {
            version: 1,
            replacementHistory: [{ type: "compaction", encrypted_content: "opaque" }],
            creatingModelId: "gpt-test",
            compactionCompatibilityHash: "family-1",
            continuationSettings: {},
          },
        },
      },
    ] as SessionEntry[];
    const ctx = context(entries);
    const markerText = `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${COMPACTION_MARKER}\n</summary>`;

    const payload = await handlers.get("before_provider_request")?.(
      {
        payload: {
          model: "gpt-test",
          input: [
            { role: "user", content: [{ type: "input_text", text: markerText }] },
            { role: "assistant", content: [{ type: "output_text", text: "intervening" }] },
          ],
        },
      },
      ctx,
    );

    expect(payload.input).toEqual([
      { type: "compaction", encrypted_content: "opaque" },
      { role: "assistant", content: [{ type: "output_text", text: "intervening" }] },
    ]);
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
