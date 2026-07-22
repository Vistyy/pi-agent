import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("installed Pi extension loader", () => {
  it("starts Pi with the extension enabled", () => {
    const result = spawnSync("pi", [], {
      encoding: "utf8",
      input: "",
      timeout: 5000,
      env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
    });

    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
