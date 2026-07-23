import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const extensionPath = fileURLToPath(new URL("../index.ts", import.meta.url));

describe("installed Pi extension loader", () => {
  it("loads the explicit extension and registers /compact-pi", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-remote-loader-"));
    try {
      const loader = new DefaultResourceLoader({
        cwd: root,
        agentDir: join(root, "agent"),
        additionalExtensionPaths: [extensionPath],
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      });
      await loader.reload();
      const loaded = loader.getExtensions();
      expect(loaded.errors).toEqual([]);
      expect(loaded.extensions.some((extension) => extension.commands.has("compact-pi"))).toBe(true);

      const result = spawnSync("pi", ["-ne", "-e", extensionPath], {
        encoding: "utf8",
        input: "",
        timeout: 5000,
        env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
