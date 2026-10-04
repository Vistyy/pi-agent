import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";

test("the actual local package loads without host-dependency warnings", async () => {
	const root = await mkdtemp(join(tmpdir(), "code-review-package-"));
	try {
		const loader = new DefaultResourceLoader({
			cwd: root, agentDir: root,
			settingsManager: SettingsManager.inMemory({ packages: [fileURLToPath(new URL("../", import.meta.url))] }),
			noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
		});
		await loader.reload();
		const loaded = loader.getExtensions();
		expect(loaded.errors).toEqual([]);
		expect(loaded.warnings ?? []).toEqual([]);
		expect(loaded.extensions.some((extension) => extension.commands.has("review"))).toBe(true);
	} finally { await rm(root, { recursive: true, force: true }); }
});
