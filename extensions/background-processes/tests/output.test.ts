import { access, readFile } from "node:fs/promises";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";
import { TaskOutput } from "../src/output.js";

const outputs: TaskOutput[] = [];

afterEach(async () => {
  await Promise.all(outputs.splice(0).map((output) => output.dispose()));
});

function createOutput(): TaskOutput {
  const output = new TaskOutput();
  outputs.push(output);
  return output;
}

describe("TaskOutput", () => {
  test("keeps short output inline without creating a file", async () => {
    const output = createOutput();
    output.append(Buffer.from("hello\n"));
    output.finish();
    await output.close();

    const snapshot = output.snapshot({ persistIfTruncated: true });

    expect(snapshot.content).toBe("hello\n");
    expect(snapshot.truncation.truncated).toBe(false);
    expect(snapshot.fullOutputPath).toBeUndefined();
  });

  test("uses Pi Bash byte limits and preserves complete output in an OS temporary file", async () => {
    const output = createOutput();
    const full = `begin\n${"x".repeat(DEFAULT_MAX_BYTES + 1024)}\nend\n`;
    output.append(Buffer.from(full));
    output.finish();
    await output.close();

    const snapshot = output.snapshot({ persistIfTruncated: true });

    expect(snapshot.truncation.truncated).toBe(true);
    expect(snapshot.truncation.maxBytes).toBe(DEFAULT_MAX_BYTES);
    expect(snapshot.content).toBe("end");
    expect(snapshot.fullOutputPath).toBeDefined();
    expect(await readFile(snapshot.fullOutputPath!, "utf8")).toBe(full);
  });

  test("uses Pi Bash line limits", async () => {
    const output = createOutput();
    const lines = Array.from({ length: DEFAULT_MAX_LINES + 5 }, (_, index) => `line-${index}`).join("\n");
    output.append(Buffer.from(lines));
    output.finish();

    const snapshot = output.snapshot();

    expect(snapshot.truncation.truncated).toBe(true);
    expect(snapshot.truncation.totalLines).toBe(DEFAULT_MAX_LINES + 5);
    expect(snapshot.content).not.toContain("line-0\n");
    expect(snapshot.content).toContain(`line-${DEFAULT_MAX_LINES + 4}`);
  });

  test("decodes UTF-8 split across chunks", () => {
    const output = createOutput();
    const bytes = Buffer.from("A € B\n", "utf8");
    output.append(bytes.subarray(0, 3));
    output.append(bytes.subarray(3));
    output.finish();

    expect(output.snapshot().content).toBe("A € B\n");
  });

  test("dispose removes a temporary output file", async () => {
    const output = createOutput();
    output.append(Buffer.alloc(DEFAULT_MAX_BYTES + 1, "z"));
    output.finish();
    await output.close();
    const path = output.snapshot().fullOutputPath!;
    await access(path);

    await output.dispose();

    await expect(access(path)).rejects.toThrow();
  });
});
