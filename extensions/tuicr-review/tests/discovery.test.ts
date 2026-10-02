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
import { createAssistantMessageEventStream, fauxAssistantMessage, getCurrentSystemMessage } from "@earendil-works/pi-ai";
import { test } from "vitest";

const baselineTools = ["bash", "edit", "read", "tool_search", "write"];

test("search advertises capabilities and loads full deferred tools without invoking them", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-deferred-discovery-"));
  const settings = SettingsManager.inMemory({ defaultTools: ["+tool_search"] });
  const resources = new DefaultResourceLoader({
    cwd: root,
    agentDir: root,
    settingsManager: settings,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: [
      fileURLToPath(new URL("../index.ts", import.meta.url)),
      fileURLToPath(new URL("../../session-handoff/index.ts", import.meta.url)),
      fileURLToPath(new URL("../../deferred-tool-hints/index.ts", import.meta.url)),
    ],
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
    let modelPrompt: string | undefined;
    await runtime.setRuntimeApiKey("openai", "fixture-key");
    runtime.registerProvider("openai", {
      api: "openai-responses",
      streamSimple: (_requestModel, context) => {
        const system = getCurrentSystemMessage(context.messages);
        assert.ok(system);
        modelPrompt = [system.content, ...Object.values(system.sections ?? {})].join("\n");
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
      assert.deepEqual(session.getActiveToolNames().sort(), baselineTools);
      const search = session.agent.state.tools.find((tool) => tool.name === "tool_search");
      assert.ok(search);
      await session.prompt("Report the available capabilities.");
      assert.equal(session.getLastAssistantText(), "fixture");
      assert.ok(modelPrompt);
      assert.match(modelPrompt, /peer-sessions: Start an independent Pi agent in Herdr\./);
      assert.match(modelPrompt, /code-review: Open and annotate committed diffs in Tuicr\./);
      assert.deepEqual(session.getActiveToolNames().sort(), baselineTools);

      const absent = await search.execute("missing-capability", { query: "nonexistentxyzzy" });
      assert.deepEqual(absent.content, [{ type: "text", text: "No matching tools found." }]);
      assert.deepEqual(session.getActiveToolNames().sort(), baselineTools);

      const reviewResult = await search.execute("find-review", {
        query: "open annotate committed diffs Tuicr",
        limit: 1,
      });
      assert.ok(reviewResult.content.some((part) => part.type === "text" && part.text.includes("tuicr_review")));
      assert.deepEqual(session.getActiveToolNames().sort(), [...baselineTools, "tuicr_review"].sort());
      const review = session.agent.state.tools.find((tool) => tool.name === "tuicr_review");
      assert.ok(review);
      assert.match(review.description, /Ground responses to feedback in the attached exact source/);
      assert.deepEqual(Object.keys(review.parameters.properties), ["cwd", "base", "head", "replaceExisting", "annotations"]);

      const peerResult = await search.execute("find-peer", {
        query: "start independent Pi agent Herdr",
        limit: 1,
      });
      assert.ok(peerResult.content.some((part) => part.type === "text" && part.text.includes("start_session")));
      assert.deepEqual(session.getActiveToolNames().sort(), [...baselineTools, "start_session", "tuicr_review"].sort());
      const peer = session.agent.state.tools.find((tool) => tool.name === "start_session");
      assert.ok(peer);
      assert.match(peer.description, /It is not a managed worker/);
      assert.deepEqual(Object.keys(peer.parameters.properties), ["prompt", "cwd", "forkContext"]);
    } finally {
      session.dispose();
      runtime.unregisterProvider("openai");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
