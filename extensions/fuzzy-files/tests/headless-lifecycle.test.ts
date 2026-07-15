import { afterEach, describe, expect, it, vi } from "vitest";

type LifecycleHandler = (event: unknown, ctx: any) => unknown;
type Extension = (api: any) => void;

async function importExtension(path: string): Promise<Extension> {
	const url = new URL(path, import.meta.url).href;
	const loaded = (await import(/* @vite-ignore */ url)) as { default: Extension };
	return loaded.default;
}

function extensionApi() {
	const handlers = new Map<string, LifecycleHandler>();
	return {
		api: {
			on: vi.fn((event: string, handler: LifecycleHandler) => handlers.set(event, handler)),
			registerCommand: vi.fn(),
			exec: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
		},
		handlers,
	};
}

function interactiveContext() {
	const ui = {
		setStatus: vi.fn(),
		setFooter: vi.fn(),
		notify: vi.fn(),
		addAutocompleteProvider: vi.fn(),
		theme: { fg: vi.fn((_color: string, text: string) => text) },
	};
	return {
		ctx: {
			hasUI: true,
			cwd: "/tmp/project",
			model: { provider: "openai-codex", id: "gpt-5-codex", name: "Codex" },
			modelRegistry: {
				getApiKeyAndHeaders: vi.fn(async () => ({ ok: true, apiKey: "test-token" })),
				getAvailable: vi.fn(() => []),
				getAll: vi.fn(() => []),
			},
			ui,
		},
		ui,
	};
}

function headlessContext() {
	let themeAccesses = 0;
	const ui = {
		setStatus: vi.fn(),
		setFooter: vi.fn(),
		notify: vi.fn(),
		addAutocompleteProvider: vi.fn(),
		get theme(): never {
			themeAccesses += 1;
			throw new Error("theme accessed in a headless context");
		},
	};
	return {
		ctx: {
			hasUI: false,
			cwd: "/tmp/project",
			model: { provider: "openai-codex", id: "gpt-5-codex", name: "Codex" },
			modelRegistry: {
				getApiKeyAndHeaders: vi.fn(),
				getAvailable: vi.fn(() => []),
				getAll: vi.fn(() => []),
			},
			ui,
		},
		ui,
		themeAccesses: () => themeAccesses,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("headless extension lifecycle", () => {
	it("does not start Codex usage UI or ancillary work", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const timerSpy = vi.spyOn(globalThis, "setTimeout");
		const { api, handlers } = extensionApi();
		const { ctx, ui, themeAccesses } = headlessContext();
		const codexUsage = await importExtension("../../codex-usage.ts");
		codexUsage(api as any);

		handlers.get("session_start")?.({}, ctx);
		handlers.get("model_select")?.({ model: ctx.model }, ctx);
		handlers.get("session_tree")?.({}, ctx);
		handlers.get("session_shutdown")?.({}, ctx);

		expect(themeAccesses()).toBe(0);
		expect(ui.setStatus).not.toHaveBeenCalled();
		expect(timerSpy).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("retains Codex usage status and refresh behavior interactively", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
			ok: true,
			text: async () =>
				JSON.stringify({
					rate_limit: {
						primary_window: { used_percent: 10 },
						secondary_window: { used_percent: 20 },
					},
				}),
		} as Response);
		const timerSpy = vi.spyOn(globalThis, "setTimeout");
		const { api, handlers } = extensionApi();
		const { ctx, ui } = interactiveContext();
		const codexUsage = await importExtension("../../codex-usage.ts");
		codexUsage(api as any);

		handlers.get("session_start")?.({}, ctx);

		await vi.waitFor(() =>
			expect(ui.setStatus).toHaveBeenLastCalledWith("codex-usage", "Codex 5H 90% 7D 80%"),
		);
		expect(fetchSpy).toHaveBeenCalledWith(
			"https://chatgpt.com/backend-api/wham/usage",
			expect.objectContaining({ headers: expect.any(Object) }),
		);
		expect(timerSpy.mock.calls.some((call) => call[1] === 5 * 60 * 1000)).toBe(true);

		handlers.get("session_shutdown")?.({}, ctx);
	});

	it("does not render the OpenAI fast indicator headlessly", async () => {
		vi.stubEnv("PI_OPENAI_FAST", "1");
		const { api, handlers } = extensionApi();
		const { ctx, ui, themeAccesses } = headlessContext();
		const openaiFast = await importExtension("../../openai-fast.ts");
		openaiFast(api as any);

		handlers.get("session_start")?.({}, ctx);

		expect(themeAccesses()).toBe(0);
		expect(ui.setStatus).not.toHaveBeenCalled();
	});

	it("retains the OpenAI fast indicator interactively", async () => {
		vi.stubEnv("PI_OPENAI_FAST", "1");
		const { api, handlers } = extensionApi();
		const { ctx, ui } = interactiveContext();
		const openaiFast = await importExtension("../../openai-fast.ts");
		openaiFast(api as any);

		handlers.get("session_start")?.({}, ctx);

		expect(ui.setStatus).toHaveBeenCalledWith("openai-fast", "⚡");
	});

	it("does not initialize file autocomplete headlessly", async () => {
		const { api, handlers } = extensionApi();
		const { ctx, ui } = headlessContext();
		const { default: fuzzyFiles } = await import("../src/index.js");
		fuzzyFiles(api as any);

		await handlers.get("session_start")?.({}, ctx);

		expect(ui.addAutocompleteProvider).not.toHaveBeenCalled();
		expect(ui.notify).not.toHaveBeenCalled();
		expect(api.exec).not.toHaveBeenCalled();
	});

	it("retains file autocomplete initialization interactively", async () => {
		const { api, handlers } = extensionApi();
		const { ctx, ui } = interactiveContext();
		const { default: fuzzyFiles } = await import("../src/index.js");
		fuzzyFiles(api as any);

		await handlers.get("session_start")?.({}, ctx);

		expect(ui.addAutocompleteProvider).toHaveBeenCalledOnce();
	});
});
