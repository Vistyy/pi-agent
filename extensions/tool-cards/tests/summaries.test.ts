import { describe, expect, it } from "vitest";
import {
  compactInvocation,
  errorSummary,
  estimatedTokenUsage,
  formatByteSize,
  formatDuration,
  resultSummary,
} from "../src/summaries.js";

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

describe("tool card summaries", () => {
  it("uses the required pending labels", () => {
    expect(resultSummary({ name: "read", args: undefined })).toBe("Reading...");
    expect(resultSummary({ name: "write", args: undefined })).toBe("Writing...");
    expect(resultSummary({ name: "edit", args: undefined })).toBe("Editing...");
    expect(resultSummary({ name: "bash", args: undefined })).toBe("Running...");
    expect(resultSummary({ name: "grep", args: undefined })).toBe("Searching...");
    expect(resultSummary({ name: "find", args: undefined })).toBe("Finding...");
    expect(resultSummary({ name: "ls", args: undefined })).toBe("Listing...");
  });

  it("summarizes read ranges and text line counts", () => {
    expect(compactInvocation("read", { path: "src/a.ts", offset: 4, limit: 3 })).toBe("src/a.ts:4-6");
    expect(compactInvocation("read", { path: "a/very/long/path/that/is/not/important/to/the/operator/README.md" })).toBe("…/operator/README.md");
    expect(resultSummary({ name: "read", args: { path: "a" }, result: text("one\ntwo\n") })).toBe("2 lines");
    expect(resultSummary({
      name: "read",
      args: { path: "a", limit: 2 },
      result: text("one\ntwo\n\n[8 more lines in file. Use offset=3 to continue.]"),
    })).toBe("2 lines");
    expect(resultSummary({
      name: "read",
      args: { path: "a" },
      result: { content: [{ type: "text", text: "one\ntwo\n\n[Showing lines 1-2 of 10. Use offset=3 to continue.]" }], details: { truncation: { outputLines: 2 } } },
    })).toBe("2 lines");
  });

  it("summarizes read images with decoded byte counts", () => {
    expect(resultSummary({
      name: "read",
      args: { path: "image.png" },
      result: { content: [{ type: "image", data: Buffer.from([1, 2, 3]).toString("base64"), mimeType: "image/png" }] },
    })).toBe("image/png · 3 B");
    expect(formatByteSize(1536)).toBe("1.5 KB");
    expect(formatByteSize(2 * 1024 * 1024)).toBe("2 MB");
  });

  it("uses logical written lines", () => {
    expect(resultSummary({ name: "write", args: { path: "a", content: "α\nβ\n" }, result: text("ok") })).toBe("2 lines");
  });

  it("counts added and removed diff lines", () => {
    expect(resultSummary({
      name: "edit",
      args: { path: "a" },
      result: { content: [], details: { diff: "-1 old\n+1 new\n+2 added\n 2 context" } },
    })).toBe("+2  -1");
  });

  it("reports bash outcome and live elapsed time", () => {
    expect(compactInvocation("bash", { command: "printf   'hello'\n" })).toBe("printf 'hello'");
    expect(resultSummary({ name: "bash", args: { command: "true" }, result: text(""), elapsedMs: 12.4 })).toBe("12ms");
    expect(resultSummary({ name: "bash", args: { command: "false" }, result: text("error\n\nCommand exited with code 7"), isError: true })).toBe("exit 7");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(65_000)).toBe("1m 5s");
  });

  it("counts grep matches and unique files, not context rows", () => {
    expect(resultSummary({
      name: "grep",
      args: { pattern: "needle", path: "src" },
      result: text("a.ts:1: needle\na.ts-2- context\nb.ts:4: needle\n[truncated]"),
    })).toBe("2 matches · 2 files");
  });

  it("counts find files and ls entries while excluding notices", () => {
    expect(resultSummary({ name: "find", args: { pattern: "*.ts", path: "." }, result: text("a.ts\nb.ts\n\n[500 results limit reached]") })).toBe("2 files");
    expect(resultSummary({ name: "ls", args: { path: "." }, result: text("a.ts\nb/\n[notice]") })).toBe("2 entries");
    expect(resultSummary({ name: "find", args: { pattern: "*.ts" }, result: text("No files found matching pattern") })).toBe("0 files");
    expect(resultSummary({ name: "ls", args: { path: "." }, result: text("(empty directory)") })).toBe("0 entries");
  });

  it("estimates generated call and ingested result tokens", () => {
    const estimate = estimatedTokenUsage("read", { path: "README.md" }, text("one two three four"));
    expect(estimate.input).toBeGreaterThan(0);
    expect(estimate.output).toBeGreaterThan(0);
    expect(estimate.total).toBe(estimate.input + estimate.output);
  });

  it("uses the first non-empty stored error line", () => {
    const result = text("\n  permission denied\nsecond line");
    expect(errorSummary(result)).toBe("permission denied");
    expect(resultSummary({ name: "read", args: { path: "a" }, result, isError: true })).toBe("permission denied");
    expect(errorSummary({ content: [] })).toBe("Tool failed without output");
  });
});
