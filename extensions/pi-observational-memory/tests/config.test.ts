import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ agentDir: "" }));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	getAgentDir: () => mock.agentDir,
}));

import { DEFAULTS, loadConfig, STRATEGY } from "../src/config.js";

function writeJson(path: string, value: unknown) {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, JSON.stringify(value), "utf-8");
}

describe("config", () => {
	let root: string;
	let cwd: string;
	let agentDir: string;

	beforeEach(() => {
		root = `${tmpdir()}/om-memory-config-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
		cwd = join(root, "project");
		agentDir = join(root, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		mock.agentDir = agentDir;
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("uses defaults", () => {
		expect(DEFAULTS).toEqual({
			strategy: STRATEGY.additive,
			observeEveryMessages: 32,
			reflectEveryObservations: 16,
			maxInitialObserveTokens: 100000,
			observationsPoolMaxTokens: 20000,
			dropWhenActiveObservationsOver: 80,
			protectRecentObservations: 32,
			agentMaxTurns: 16,
			additivePatchMaxTokens: 2000,
			debugLog: false,
		});
		expect(loadConfig(cwd)).toEqual(DEFAULTS);
	});

	it("merges global and project settings in order", () => {
		writeJson(join(agentDir, "settings.json"), {
			"observational-memory": {
				strategy: "replacement",
				observeEveryMessages: 10,
				reflectEveryObservations: 20,
				maxInitialObserveTokens: 60,
				observationsPoolMaxTokens: 40,
				dropWhenActiveObservationsOver: 15,
				agentMaxTurns: 5,
				additivePatchMaxTokens: 500,
				model: { provider: "anthropic", id: "global", thinking: "medium" },
				debugLog: true,
			},
		});
		writeJson(join(cwd, ".pi", "settings.json"), {
			"observational-memory": {
				strategy: "additive",
				observeEveryMessages: 100,
				model: { provider: "openai", id: "project", thinking: "low" },
			},
		});

		expect(loadConfig(cwd)).toMatchObject({
			strategy: "additive",
			observeEveryMessages: 100,
			reflectEveryObservations: 20,
			maxInitialObserveTokens: 60,
			observationsPoolMaxTokens: 40,
			dropWhenActiveObservationsOver: 15,
			agentMaxTurns: 5,
			additivePatchMaxTokens: 500,
			model: { provider: "openai", id: "project", thinking: "low" },
			debugLog: true,
		});
	});

	it("ignores invalid values", () => {
		writeJson(join(cwd, ".pi", "settings.json"), {
			"observational-memory": {
				strategy: "unknown",
				observeEveryMessages: -1,
				reflectEveryObservations: 0,
				maxInitialObserveTokens: "100000",
				observationsPoolMaxTokens: "20000",
				dropWhenActiveObservationsOver: "10000",
				agentMaxTurns: null,
				model: { provider: "anthropic", id: "", thinking: "huge" },
				debugLog: "true",
			},
		});

		expect(loadConfig(cwd)).toEqual(DEFAULTS);
	});

});
