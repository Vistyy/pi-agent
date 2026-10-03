import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  createToolSearchExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream, fauxAssistantMessage, getCurrentTools, type Tool } from "@earendil-works/pi-ai";
import { test } from "vitest";

const defaultTools = ["bash", "edit", "read", "tuicr_review", "write"];

test("declares the full review tool on the first prompt without tool search", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-direct-review-"));
  const settings = SettingsManager.inMemory();
  const resources = new DefaultResourceLoader({
    cwd: root,
    agentDir: root,
    settingsManager: settings,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL("../index.ts", import.meta.url))],
    extensionFactories: [createToolSearchExtension()],
  });
  try {
    await resources.reload();
    assert.deepEqual(resources.getExtensions().errors, []);
    const runtime = await ModelRuntime.create({
      authPath: join(root, "auth.json"),
      modelsPath: null,
      refreshOnCreate: false,
    });
    let declaredTools: Tool[] | undefined;
    await runtime.setRuntimeApiKey("openai", "fixture-key");
    runtime.registerProvider("openai", {
      api: "openai-responses",
      streamSimple: (_requestModel, context) => {
        declaredTools = getCurrentTools(context.messages);
        const stream = createAssistantMessageEventStream();
        stream.end(fauxAssistantMessage("fixture"));
        return stream;
      },
    });
    const model = runtime.getModel("openai", "gpt-4.1");
    assert.ok(model);
    const { session } = await createAgentSession({
      cwd: root,
      agentDir: root,
      resourceLoader: resources,
      modelRuntime: runtime,
      model,
      settingsManager: settings,
      sessionManager: SessionManager.inMemory(root),
    });
    try {
      await session.prompt("Report the available capabilities.");
      assert.equal(session.getLastAssistantText(), "fixture");
      assert.deepEqual(declaredTools?.map((tool) => tool.name).sort(), defaultTools);
      const review = declaredTools?.find((tool) => tool.name === "tuicr_review");
      assert.ok(review);
      assert.match(review.description, /Ground responses to feedback in the attached exact source/);
      assert.ok("properties" in review.parameters);
      assert.ok(review.parameters.properties && typeof review.parameters.properties === "object");
      assert.deepEqual(Object.keys(review.parameters.properties), ["cwd", "base", "head", "replaceExisting", "annotations"]);
    } finally {
      session.dispose();
      runtime.unregisterProvider("openai");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
