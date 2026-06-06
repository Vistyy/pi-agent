import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI, ExtensionContext, ExtensionHandler } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { registerAdditiveContext } from "../src/hooks/additive-context.js";
import type { Runtime } from "../src/runtime.js";
import { compactionEntry, observation, observationsRecordedEntry, textCustomMessage } from "./fixtures/session.js";

type BeforeAgentStartHandler = ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>;

function setup(strategy: "additive" | "replacement" | "off") {
	let handler: BeforeAgentStartHandler | undefined;
	const pi = {
		on: vi.fn((eventName: string, cb: BeforeAgentStartHandler) => {
			expect(eventName).toBe("before_agent_start");
			handler = cb;
		}),
	};
	const runtime = {
		config: { strategy, additivePatchMaxTokens: 2000 },
		ensureConfig: vi.fn(),
	} as unknown as Runtime;
	registerAdditiveContext(pi as unknown as ExtensionAPI, runtime);
	if (!handler) throw new Error("before_agent_start handler was not registered");
	return { handler, runtime };
}

function event(): BeforeAgentStartEvent {
	return { type: "before_agent_start", prompt: "", systemPrompt: "base prompt", systemPromptOptions: {} } as BeforeAgentStartEvent;
}

function context(entries: unknown[]): ExtensionContext {
	return { cwd: "/tmp/project", sessionManager: { getBranch: () => entries } } as unknown as ExtensionContext;
}

describe("additive context", () => {
	it("injects exact-detail patch only when enabled after compaction", () => {
		const obs = observation("aaaaaaaaaaaa", {
			event: {
				title: "Tests passed",
				details: ["npm test passed: 20 files, 150 tests"],
				status: "completed",
			},
		});
		const entries = [
			textCustomMessage("raw-1", "test output"),
			observationsRecordedEntry("om-1", { observations: [obs], coversUpToId: "raw-1" }),
			compactionEntry("cmp-1"),
		];
		const { handler } = setup("additive");

		const result = handler(event(), context(entries)) as BeforeAgentStartEventResult;

		expect(result.systemPrompt).toContain("base prompt");
		expect(result.systemPrompt).toContain("Observational memory exact-detail patch");
		expect(result.systemPrompt).toContain("Tests passed");
		expect(result.systemPrompt).toContain("npm test passed: 20 files, 150 tests");
	});

	it("does not inject before compaction", () => {
		const obs = observation("aaaaaaaaaaaa", { relevance: "critical" });
		const entries = [
			textCustomMessage("raw-1", "test output"),
			observationsRecordedEntry("om-1", { observations: [obs], coversUpToId: "raw-1" }),
		];
		const { handler } = setup("additive");

		expect(handler(event(), context(entries))).toBeUndefined();
	});

	it("does not inject context when additive patch is off", () => {
		const { handler } = setup("replacement");
		expect(handler(event(), context([]))).toBeUndefined();
	});
});
