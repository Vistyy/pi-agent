import { describe, expect, it, vi } from "vitest";
import { extractAccountId, requestRemoteCompaction } from "../src/remote.js";

function token(accountId: string): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({
    "https://api.openai.com/auth": { chatgpt_account_id: accountId },
  })}.signature`;
}

function sse(events: unknown[]): Response {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

describe("Codex remote compaction transport", () => {
  it("extracts the ChatGPT account ID from Codex OAuth", () => {
    expect(extractAccountId(token("account-1"))).toBe("account-1");
  });

  it("returns the opaque compaction item and normalized usage", async () => {
    const fetch = vi.fn(async () =>
      sse([
        {
          type: "response.output_item.done",
          item: { type: "compaction", id: "cmp_1", encrypted_content: "opaque" },
        },
        {
          type: "response.completed",
          response: {
            output: [{ type: "compaction", id: "cmp_1", encrypted_content: "opaque" }],
            usage: {
              input_tokens: 100,
              input_tokens_details: { cached_tokens: 80 },
              output_tokens: 4,
              total_tokens: 104,
            },
          },
        },
      ]),
    );

    const result = await requestRemoteCompaction({
      fetch,
      token: token("account-1"),
      body: { model: "gpt-test", store: false, stream: true },
    });

    expect(result.replacementHistory).toEqual([
      { type: "compaction", id: "cmp_1", encrypted_content: "opaque" },
    ]);
    expect(result.usage).toEqual({
      input: 20,
      output: 4,
      cacheRead: 80,
      cacheWrite: 0,
      totalTokens: 104,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/codex/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Bearer "),
          "chatgpt-account-id": "account-1",
          "x-codex-beta-features": "remote_compaction_v2",
        }),
      }),
    );
  });

  it("retries transient HTTP and network failures up to three total attempts", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection refused"))
      .mockResolvedValueOnce(new Response("overloaded", { status: 503 }))
      .mockResolvedValueOnce(
        sse([
          {
            type: "response.completed",
            response: {
              output: [{ type: "compaction", encrypted_content: "opaque" }],
            },
          },
        ]),
      );
    const sleep = vi.fn(async (_delay: number, _signal?: AbortSignal) => undefined);

    await expect(
      requestRemoteCompaction({
        fetch,
        sleep,
        token: token("account-1"),
        body: { model: "gpt-test" },
      }),
    ).resolves.toMatchObject({
      replacementHistory: [{ type: "compaction", encrypted_content: "opaque" }],
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([1000, 2000]);
  });

  it("respects Retry-After for rate limits", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", { status: 429, headers: { "Retry-After": "2" } }),
      )
      .mockResolvedValueOnce(
        sse([
          {
            type: "response.completed",
            response: {
              output: [{ type: "compaction", encrypted_content: "opaque" }],
            },
          },
        ]),
      );
    const sleep = vi.fn(async (_delay: number, _signal?: AbortSignal) => undefined);

    await requestRemoteCompaction({
      fetch,
      sleep,
      token: token("account-1"),
      body: { model: "gpt-test" },
    });

    expect(sleep).toHaveBeenCalledWith(2000, undefined);
  });

  it.each([
    [401, "authentication failed"],
    [400, "invalid request"],
    [429, '{"error":{"code":"usage_limit_reached"}}'],
    [429, '{"error":{"code":"usage_not_included"}}'],
    [429, "No available balance remains"],
    [429, "Account is out of budget"],
    [429, "Billing quota exceeded"],
  ])("does not retry terminal HTTP %s responses: %s", async (status, body) => {
    const fetch = vi.fn(async () => new Response(body, { status }));

    await expect(
      requestRemoteCompaction({
        fetch,
        sleep: vi.fn(async () => undefined),
        token: token("account-1"),
        body: { model: "gpt-test" },
      }),
    ).rejects.toThrow("OpenAI remote compaction failed");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("retries the HTTP 5xx server-error range", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("not implemented", { status: 501 }))
      .mockResolvedValueOnce(
        sse([
          {
            type: "response.completed",
            response: {
              output: [{ type: "compaction", encrypted_content: "opaque" }],
            },
          },
        ]),
      );

    await expect(
      requestRemoteCompaction({
        fetch,
        sleep: vi.fn(async () => undefined),
        token: token("account-1"),
        body: { model: "gpt-test" },
      }),
    ).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["invalid_request_error", "Invalid request"],
    ["access_denied", "Access denied"],
    ["permission_denied", "Permission denied"],
    ["invalid_api_key", "Invalid API key"],
  ])("does not retry terminal SSE failure %s", async (code, message) => {
    const fetch = vi.fn(async () =>
      sse([
        {
          type: "response.failed",
          response: { error: { code, message } },
        },
      ]),
    );

    await expect(
      requestRemoteCompaction({
        fetch,
        sleep: vi.fn(async () => undefined),
        token: token("account-1"),
        body: { model: "gpt-test" },
      }),
    ).rejects.toThrow(message);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("stops after three retryable failures", async () => {
    const fetch = vi.fn(async () => new Response("overloaded", { status: 503 }));

    await expect(
      requestRemoteCompaction({
        fetch,
        sleep: vi.fn(async () => undefined),
        token: token("account-1"),
        body: { model: "gpt-test" },
      }),
    ).rejects.toThrow("OpenAI remote compaction failed (503)");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not start or retry when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();

    await expect(
      requestRemoteCompaction({
        fetch,
        sleep: vi.fn(async () => undefined),
        token: token("account-1"),
        body: { model: "gpt-test" },
        signal: controller.signal,
      }),
    ).rejects.toThrow("aborted");
    expect(fetch).not.toHaveBeenCalled();
  });
});
