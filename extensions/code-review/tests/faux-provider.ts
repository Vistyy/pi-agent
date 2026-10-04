import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { contentText, fauxAssistantMessage, fauxProvider, fauxToolCall, type Model, type Api } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { Value } from "typebox/value";

const Json = Type.Cyclic({ Json: Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null(), Type.Array(Type.Ref("Json")), Type.Record(Type.String(), Type.Ref("Json"))]) }, "Json");
const ScopePlan = Type.Record(Type.String(), Json);

export default function verificationProvider(pi: ExtensionAPI): void {
	const faux = fauxProvider({ provider: "code-review-live", models: [{ id: "fixture", reasoning: true }, { id: "author", reasoning: true }, { id: "saved-reviewer", reasoning: true }], tokensPerSecond: Infinity });
	const models: Model<Api>[] = faux.models;
	for (const model of models) model.compat = { supportsAdditionalTools: true, supportsMidConvoSystemMessages: true };
	faux.setResponses(Array.from({ length: 100 }, () => async (context, options, _state, model) => {
		const root = getAgentDir();
		appendFileSync(join(root, `verification-wire-${process.pid}.jsonl`), `${JSON.stringify({ ...context, selectedModel: { provider: model.provider, id: model.id }, options })}\n`);
		const input = context.messages.findLast(message => message.role === "user");
		const text = contentText(input?.content ?? "");
		const finalizing = text.includes("Finalize this review");
		if (finalizing) {
			await new Promise(done => setTimeout(done, 2_000));
			return fauxAssistantMessage("Complete updated live verification report. Finding A remains. Finding B was resolved. Scope: code-review. No code changes or comments.");
		}
		if (context.messages.findLast(message => message.role !== "system")?.role === "user" && text === "Hold author tool work for verification.") {
			return fauxAssistantMessage(fauxToolCall("verification_read", { path: join(root, "workspace", "shared.json") }));
		}
		if (context.messages.findLast(message => message.role !== "system")?.role === "user" && text.startsWith("Prepare an independent review of our work.")) {
			if (text.includes("Propose the scope from our current work")) return fauxAssistantMessage("Which services should be included in the review?");
			const plan = Value.Parse(ScopePlan, JSON.parse(readFileSync(join(root, "verification-scope.json"), "utf8")));
			return fauxAssistantMessage(fauxToolCall("start_review", plan));
		}
		return fauxAssistantMessage(text.includes("## Review received")
			? "Author assessed the returned report against current code and the agreed scope."
			: "Initial verification findings remain here for discussion. This is a controlled provider response, not a code-quality assessment.");
	}));
	pi.registerProvider(faux.provider);
	pi.registerTool({
		name: "verification_read", label: "Read owned fixture", description: "Read an owned file after the execution gate is released.",
		parameters: Type.Object({ path: Type.String() }),
		async execute(_id, input, signal) {
			const root = getAgentDir();
			writeFileSync(join(root, "author-held.json"), JSON.stringify({ pid: process.pid }));
			const end = Date.now() + 30_000;
			while (!existsSync(join(root, "author-release.json"))) {
				signal?.throwIfAborted();
				if (Date.now() > end) throw new Error("Owned author tool gate timed out.");
				await new Promise(done => setTimeout(done, 50));
			}
			signal?.throwIfAborted();
			return { content: [{ type: "text", text: readFileSync(input.path, "utf8") }], details: undefined };
		},
	});
	pi.on("session_start", async (_event, ctx) => {
		const controlledBinary = join(getAgentDir(), "herdr-opening-control.mjs");
		if (existsSync(controlledBinary)) process.env.HERDR_BIN_PATH = controlledBinary;
		pi.appendEntry("code-review.verification-model", { provider: ctx.model?.provider, model: ctx.model?.id, thinkingLevel: pi.getThinkingLevel(), agentDir: getAgentDir(), herdrSocket: process.env.HERDR_SOCKET_PATH, commands: pi.getCommands().map(command => command.name), tools: pi.getActiveTools() });
		const gate = join(getAgentDir(), "hold-reviewer-startup");
		if (!ctx.sessionManager.getBranch().some(entry => entry.type === "custom" && entry.customType === "code-review.origin") || !existsSync(gate)) return;
		writeFileSync(join(getAgentDir(), "reviewer-startup-held.json"), JSON.stringify({ pid: process.pid }));
		const end = Date.now() + 10_000;
		while (existsSync(gate)) {
			if (Date.now() > end) throw new Error("Owned reviewer startup gate timed out.");
			await new Promise(done => setTimeout(done, 50));
		}
	});
}
