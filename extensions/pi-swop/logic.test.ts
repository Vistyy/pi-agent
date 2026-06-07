// ── pi-swop: logic tests ──────────────────────────────────────
// Run with: npx tsx --test logic.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AccountUsage, PlanTier } from "./types";
import {
  decodeEmail,
  parseWindow,
  resolveResetAt,
  asNumber,
  asTimestamp,
  remaining,
  clamp,
  truncateEmail,
  getCombinedDisplay,
  effectiveRemaining,
  formatResetTime,
  rankAccounts,
  mergeAbortSignals,
} from "./logic";

// ════════════════════════════════════════════════════════════════
// decodeEmail
// ════════════════════════════════════════════════════════════════

describe("decodeEmail", () => {
  it("returns undefined for non-JWT strings", () => {
    assert.equal(decodeEmail(""), undefined);
    assert.equal(decodeEmail("not.a.jwt"), undefined);
    assert.equal(decodeEmail("a.b"), undefined);
  });

  it("returns undefined for JWT without profile claim", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "123" })).toString(
      "base64url",
    );
    const token = `h.${payload}.s`;
    assert.equal(decodeEmail(token), undefined);
  });

  it("extracts Codex account id from OpenAI auth claim", () => {
    const payload = Buffer.from(
      JSON.stringify({
        "https://api.openai.com/auth": { chatgpt_account_id: "acct_123" },
      }),
    ).toString("base64url");
    const token = `h.${payload}.s`;
    assert.equal(decodeEmail(token), "codex-acct_123");
  });

  it("extracts email from OpenAI profile claim", () => {
    const profile = { email: "user@gmail.com" };
    const payload = Buffer.from(
      JSON.stringify({ "https://api.openai.com/profile": profile }),
    ).toString("base64url");
    const token = `h.${payload}.s`;
    assert.equal(decodeEmail(token), "user@gmail.com");
  });

  it("returns undefined when profile has no email", () => {
    const payload = Buffer.from(
      JSON.stringify({ "https://api.openai.com/profile": {} }),
    ).toString("base64url");
    const token = `h.${payload}.s`;
    assert.equal(decodeEmail(token), undefined);
  });

  it("handles base64 padding", () => {
    const profile = { email: "test@test.com" };
    const json = JSON.stringify({
      "https://api.openai.com/profile": profile,
    });
    const payload = Buffer.from(json).toString("base64");
    const token = `h.${payload}.s`;
    assert.equal(decodeEmail(token), "test@test.com");
  });
});

// ════════════════════════════════════════════════════════════════
// numeric coercion
// ════════════════════════════════════════════════════════════════

describe("asNumber", () => {
  it("returns number for number input", () => {
    assert.equal(asNumber(42), 42);
    assert.equal(asNumber(0), 0);
    assert.equal(asNumber(-1), -1);
    assert.equal(asNumber(3.14), 3.14);
  });

  it("returns number for numeric string", () => {
    assert.equal(asNumber("42"), 42);
    assert.equal(asNumber("  3.14  "), 3.14);
    assert.equal(asNumber("-1"), -1);
  });

  it("returns undefined for non-numeric input", () => {
    assert.equal(asNumber("abc"), undefined);
    assert.equal(asNumber(""), undefined);
    assert.equal(asNumber(null), undefined);
    assert.equal(asNumber(undefined), undefined);
    assert.equal(asNumber({}), undefined);
    assert.equal(asNumber([]), undefined);
    assert.equal(asNumber(true), undefined);
    assert.equal(asNumber(NaN), undefined);
    assert.equal(asNumber(Infinity), undefined);
  });
});

describe("asTimestamp", () => {
  it("converts seconds to milliseconds", () => {
    assert.equal(asTimestamp(1700000000), 1_700_000_000_000);
  });

  it("passes through millisecond timestamps", () => {
    const ms = Date.now();
    assert.equal(asTimestamp(ms), ms);
  });

  it("parses string seconds", () => {
    assert.equal(asTimestamp("1700000000"), 1_700_000_000_000);
  });

  it("returns undefined for invalid input", () => {
    assert.equal(asTimestamp("abc"), undefined);
    assert.equal(asTimestamp(null), undefined);
  });
});

// ════════════════════════════════════════════════════════════════
// parseWindow / resolveResetAt
// ════════════════════════════════════════════════════════════════

describe("parseWindow", () => {
  it("returns null for non-object", () => {
    assert.equal(parseWindow(null), null);
    assert.equal(parseWindow(undefined), null);
    assert.equal(parseWindow("string"), null);
    assert.equal(parseWindow(42), null);
  });

  it("returns null when used_percent is missing", () => {
    assert.equal(parseWindow({}), null);
    assert.equal(parseWindow({ reset_at: 1000 }), null);
  });

  it("parses numeric used_percent", () => {
    const w = parseWindow({ used_percent: 25.5 });
    assert.ok(w);
    assert.equal(w!.usedPercent, 25.5);
  });

  it("parses string used_percent", () => {
    const w = parseWindow({ used_percent: "75" });
    assert.ok(w);
    assert.equal(w!.usedPercent, 75);
  });

  it("resolves reset_at from various field names", () => {
    const now = Date.now();
    const w = parseWindow({
      used_percent: 50,
      reset_at: now,
    });
    assert.ok(w);
    assert.equal(w!.resetAt, now);
  });

  it("resolves reset from resets_after_seconds", () => {
    const before = Date.now();
    const w = parseWindow({
      used_percent: 50,
      resets_after_seconds: 3600,
    });
    const after = Date.now();
    assert.ok(w);
    assert.ok(w!.resetAt! >= before + 3600 * 1000 - 10);
    assert.ok(w!.resetAt! <= after + 3600 * 1000 + 10);
  });

  it("prefers absolute reset over relative", () => {
    const now = Date.now();
    const w = parseWindow({
      used_percent: 50,
      reset_at: now,
      resets_after_seconds: 999,
    });
    assert.equal(w!.resetAt, now);
  });
});

describe("resolveResetAt", () => {
  it("returns undefined for empty object", () => {
    assert.equal(resolveResetAt({}), undefined);
  });

  it("handles reset_at as seconds", () => {
    assert.equal(resolveResetAt({ reset_at: 1700000 }), 1_700_000_000);
  });

  it("handles end_time as milliseconds", () => {
    const ms = 1_700_000_000_000;
    assert.equal(resolveResetAt({ end_time: ms }), ms);
  });

  it("handles seconds_until_reset as a relative offset", () => {
    const before = Date.now();
    const result = resolveResetAt({ seconds_until_reset: 60 });
    const after = Date.now();
    assert.ok(result! >= before + 60_000 - 10);
    assert.ok(result! <= after + 60_000 + 10);
  });
});

// ════════════════════════════════════════════════════════════════
// display helpers
// ════════════════════════════════════════════════════════════════

describe("remaining", () => {
  it("computes raw remaining percentage", () => {
    assert.equal(remaining({ usedPercent: 0, resetAt: 0 }), "100");
    assert.equal(remaining({ usedPercent: 25, resetAt: 0 }), "75");
    assert.equal(remaining({ usedPercent: 100, resetAt: 0 }), "0");
  });

  it("clamps out-of-range values", () => {
    assert.equal(remaining({ usedPercent: -10, resetAt: 0 }), "100");
    assert.equal(remaining({ usedPercent: 150, resetAt: 0 }), "0");
  });
});

describe("effectiveRemaining", () => {
  it("multiplies by plan tier", () => {
    const w = { usedPercent: 20, resetAt: 0 };
    assert.equal(effectiveRemaining(w, "plus"), 80);      // 1×
    assert.equal(effectiveRemaining(w, "pro-lite"), 400);  // 5×
    assert.equal(effectiveRemaining(w, "pro"), 1600);      // 20×
    assert.equal(effectiveRemaining(w, "free"), 80);       // 1×
    assert.equal(effectiveRemaining(w, "unknown"), 80);    // 1×
  });
});

describe("clamp", () => {
  it("clamps to 0-100", () => {
    assert.equal(clamp(-5), 0);
    assert.equal(clamp(0), 0);
    assert.equal(clamp(50), 50);
    assert.equal(clamp(100), 100);
    assert.equal(clamp(200), 100);
    assert.equal(clamp(NaN), 0);
    assert.equal(clamp(Infinity), 0);
  });
});

describe("truncateEmail", () => {
  it("truncates long emails", () => {
    const result = truncateEmail("verylongusername@gmail.com");
    assert.ok(result.length <= 16);
    assert.ok(result.endsWith("@gmail.com"));
  });

  it("handles emails without @", () => {
    assert.equal(truncateEmail("noatsign"), "noatsign");
  });

  it("handles short emails unchanged", () => {
    assert.equal(truncateEmail("a@b.c"), "a@b.c");
  });
});

// ════════════════════════════════════════════════════════════════
// formatResetTime
// ════════════════════════════════════════════════════════════════

describe("formatResetTime", () => {
  it("returns ? for undefined", () => {
    assert.equal(formatResetTime(undefined), "?");
  });

  it("shows (now) for past timestamps", () => {
    const past = Date.now() - 60_000;
    assert.ok(formatResetTime(past).includes("(now)"));
  });

  it("shows minutes for <1h", () => {
    const future = Date.now() + 30 * 60_000;
    const result = formatResetTime(future);
    assert.ok(result.includes("m") || result.includes("30"));
    assert.ok(!result.includes("h"));
  });

  it("shows hours+minutes for <24h", () => {
    const future = Date.now() + 2.5 * 3600_000;
    const result = formatResetTime(future);
    assert.ok(result.includes("h"));
  });

  it("shows days for >24h", () => {
    const future = Date.now() + 50 * 3600_000;
    assert.ok(formatResetTime(future).includes("d"));
  });
});

// ════════════════════════════════════════════════════════════════
// getCombinedDisplay
// ════════════════════════════════════════════════════════════════

function mkUsage(
  fh: number | null,
  sd: number | null,
  tier: PlanTier = "plus",
): Pick<AccountUsage, "planTier" | "fiveHour" | "sevenDay"> {
  return {
    planTier: tier,
    fiveHour: fh !== null ? { usedPercent: fh, resetAt: 0 } : null,
    sevenDay: sd !== null ? { usedPercent: sd, resetAt: 0 } : null,
  };
}

describe("getCombinedDisplay", () => {
  it("returns null for empty accounts", () => {
    assert.equal(getCombinedDisplay([]), null);
  });

  it("shows combined usage across accounts", () => {
    const display = getCombinedDisplay([
      { email: "a@b.c", ...mkUsage(20, 30) },
      { email: "x@y.z", ...mkUsage(50, 60) },
    ]);
    // 5H: (100-20)*1 + (100-50)*1 = 80+50 = 130
    // 7D: (100-30)*1 + (100-60)*1 = 70+40 = 110
    assert.ok(display!.includes("130%"));
    assert.ok(display!.includes("110%"));
  });

  it("handles single account", () => {
    const display = getCombinedDisplay([
      { email: "a@b.c", ...mkUsage(20, 30) },
    ]);
    assert.ok(display!.includes("80%"));
    assert.ok(display!.includes("70%"));
  });

  it("handles missing usage windows", () => {
    assert.equal(
      getCombinedDisplay([
        { email: "a@b.c", ...mkUsage(null, null) },
      ]),
      null,
    );
  });

  it("handles mixed missing windows", () => {
    const display = getCombinedDisplay([
      { email: "a@b.c", ...mkUsage(20, null) },
      { email: "x@y.z", ...mkUsage(null, 60) },
    ]);
    assert.ok(display!.includes("80%"));
    assert.ok(display!.includes("40%"));
  });

  it("selects model-specific snapshots when present", () => {
    const display = getCombinedDisplay([
      {
        email: "a@b.c",
        planTier: "plus",
        fiveHour: { usedPercent: 90, resetAt: 0 },
        sevenDay: { usedPercent: 90, resetAt: 0 },
        snapshots: [
          {
            id: "codex",
            fiveHour: { usedPercent: 90, resetAt: 0 },
            sevenDay: { usedPercent: 90, resetAt: 0 },
          },
          {
            id: "gpt-5-5",
            name: "GPT 5.5",
            fiveHour: { usedPercent: 25, resetAt: 0 },
            sevenDay: { usedPercent: 50, resetAt: 0 },
          },
        ],
      },
    ], ["gpt-5.5"]);
    assert.ok(display!.includes("75%"));
    assert.ok(display!.includes("50%"));
  });

  it("applies plan multipliers", () => {
    // plus: 50% used → 50 remaining
    // pro:  50% used → 50 remaining × 20 = 1000 effective
    const display = getCombinedDisplay([
      { email: "a@b.c", ...mkUsage(50, 0, "plus") },
      { email: "x@y.z", ...mkUsage(50, 0, "pro") },
    ]);
    // 5H: 50 + 1000 = 1050
    assert.ok(display!.includes("1050%"));
  });
});

// ════════════════════════════════════════════════════════════════
// rankAccounts
// ════════════════════════════════════════════════════════════════

describe("rankAccounts", () => {
  it("sorts by 5H remaining descending", () => {
    const ranked = rankAccounts([
      { email: "a", fiveHourRemaining: 30, sevenDayRemaining: 50, lastUsed: 0 },
      { email: "b", fiveHourRemaining: 80, sevenDayRemaining: 20, lastUsed: 0 },
      { email: "c", fiveHourRemaining: 50, sevenDayRemaining: 90, lastUsed: 0 },
    ]);
    assert.deepEqual(
      ranked.map((r) => r.email),
      ["b", "c", "a"],
    );
  });

  it("tiebreaks with 7D remaining", () => {
    const ranked = rankAccounts([
      { email: "a", fiveHourRemaining: 50, sevenDayRemaining: 30, lastUsed: 0 },
      { email: "b", fiveHourRemaining: 50, sevenDayRemaining: 80, lastUsed: 0 },
    ]);
    assert.deepEqual(
      ranked.map((r) => r.email),
      ["b", "a"],
    );
  });

  it("tiebreaks with lastUsed (LRU first)", () => {
    const ranked = rankAccounts([
      { email: "a", fiveHourRemaining: 50, sevenDayRemaining: 50, lastUsed: 1000 },
      { email: "b", fiveHourRemaining: 50, sevenDayRemaining: 50, lastUsed: 500 },
      { email: "c", fiveHourRemaining: 50, sevenDayRemaining: 50, lastUsed: 2000 },
    ]);
    assert.deepEqual(
      ranked.map((r) => r.email),
      ["b", "a", "c"],
    );
  });

  it("does not mutate input", () => {
    const input = [
      { email: "a", fiveHourRemaining: 80, sevenDayRemaining: 50, lastUsed: 0 },
      { email: "b", fiveHourRemaining: 30, sevenDayRemaining: 50, lastUsed: 0 },
    ];
    const copy = [...input];
    rankAccounts(input);
    assert.deepEqual(input, copy);
  });
});

// ════════════════════════════════════════════════════════════════
// mergeAbortSignals
// ════════════════════════════════════════════════════════════════

describe("mergeAbortSignals", () => {
  it("returns already-aborted signal", () => {
    const c = new AbortController();
    c.abort("test reason");
    const merged = mergeAbortSignals([c.signal, new AbortController().signal]);
    assert.equal(merged.aborted, true);
    assert.equal(merged.reason, "test reason");
  });

  it("aborts when any input aborts", () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    const merged = mergeAbortSignals([c1.signal, c2.signal]);
    assert.equal(merged.aborted, false);
    c2.abort("boom");
    assert.equal(merged.aborted, true);
    assert.equal(merged.reason, "boom");
  });

  it("handles single signal", () => {
    const c = new AbortController();
    const merged = mergeAbortSignals([c.signal]);
    assert.equal(merged.aborted, false);
    c.abort();
    assert.equal(merged.aborted, true);
  });

  it("handles empty array", () => {
    const merged = mergeAbortSignals([]);
    assert.equal(merged.aborted, false);
  });
});
