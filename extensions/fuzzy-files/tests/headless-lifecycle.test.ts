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
			exec: vi.fn(async () => ({ code: 0, stdout: "", stderr: "" })),
		},
		handlers,
	};
}

function interactiveContext() {
	const ui = {
		notify: vi.fn(),
		addAutocompleteProvider: vi.fn(),
	};
	return { ctx: { hasUI: true, cwd: "/tmp/project", ui }, ui };
}

function headlessContext() {
	const ui = {
		notify: vi.fn(),
		addAutocompleteProvider: vi.fn(),
	};
	return { ctx: { hasUI: false, cwd: "/tmp/project", ui }, ui };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("fuzzy-files lifecycle", () => {
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
