import { createAgentSessionFromServices, createAgentSessionRuntime, createAgentSessionServices, ModelRuntime, SessionManager, SettingsManager, type AgentSessionRuntime, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { fauxProvider, InMemoryCredentialStore, type FauxResponseStep, type Model, type Api } from "@earendil-works/pi-ai";
import { join } from "node:path";
import codeReview from "../index.ts";

export async function nativeSession(root: string, cwd: string, manager: SessionManager, responses: FauxResponseStep[], options: { tools?: string[]; settings?: SettingsManager; initialize?: boolean; cacheSafe?: boolean; extensions?: ExtensionFactory[] } = {}) {
	const settings = options.settings ?? SettingsManager.inMemory({ packages: [], compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off" });
	const provider = fauxProvider({ provider: "code-review-fixture", models: [{ id: "fixture", reasoning: true }, { id: "saved-reviewer", reasoning: true }], tokensPerSecond: Infinity });
	const models: Model<Api>[] = provider.models;
	if (options.cacheSafe !== false) for (const model of models) model.compat = { supportsAdditionalTools: true, supportsMidConvoSystemMessages: true };
	provider.setResponses(responses);
	const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: join(root, "models-store.json"), allowModelNetwork: false });
	runtime.registerNativeProvider(provider.provider);
	const errors: string[] = [];
	const modelSelections: string[] = [];
	let commandNames: () => string[] = () => [];
	const host = await createAgentSessionRuntime(async (runtimeOptions) => {
		const services = await createAgentSessionServices({ cwd: runtimeOptions.cwd, agentDir: root, settingsManager: settings, modelRuntime: runtime, extensionFlagValues: options.initialize ? new Map([["review-initialize", true]]) : undefined, resourceLoaderOptions: { noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [codeReview, (pi) => { commandNames = () => pi.getCommands().map((command) => command.name); pi.on("model_select", (event) => { modelSelections.push(event.model.id); }); }, ...(options.extensions ?? [])] } });
		return { ...(await createAgentSessionFromServices({ services, sessionManager: runtimeOptions.sessionManager, sessionStartEvent: runtimeOptions.sessionStartEvent, model: provider.getModel(), thinkingLevel: "off", tools: options.tools ? [...options.tools, "start_review"] : undefined })), services, diagnostics: services.diagnostics };
	}, { cwd, agentDir: root, sessionManager: manager });
	const bind = (session: typeof host.session) => session.bindExtensions({ onError: (error) => errors.push(error.error) });
	host.setRebindSession(bind); await bind(host.session);
	return { session: host.session, host, errors, provider, modelSelections, commandNames: () => commandNames() };
}

export async function eventually(check: () => boolean | Promise<boolean>, timeout = 5_000): Promise<void> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) { if (await check()) return; await new Promise((done) => setTimeout(done, 30)); }
	throw new Error("Observable outcome did not occur before the timeout.");
}

export async function dispose(host: AgentSessionRuntime): Promise<void> {
	await host.session.abort();
	await host.dispose();
}
