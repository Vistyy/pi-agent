import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getCurrentTools, hasNonAdditiveToolChanges } from "@earendil-works/pi-ai";
import type { ContextWithSystemEvent, ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme, SessionManager } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, SelectList, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { ReviewPanes, inHerdr } from "./herdr.ts";
import { captureScope, reviewRequest, ScopeInputSchema, type Scope } from "./scope.ts";
import { alreadyFinalized, branch, FAILED, FINALIZED, finalAnswer, hasReport, LINK, links, ORIGIN, origin, pendingFinalization, pendingPreparation, PREPARATION_CANCELLED, PREPARING, publications, readSession, REPORT, REQUEST, sessionRef, type Link, type SessionRef } from "./sessions.ts";

const extensionFile = fileURLToPath(import.meta.url);
const START_REVIEW = "start_review";
const ReviewerDefaultsSchema = Type.Object({
	model: Type.Optional(Type.String({ pattern: "^[^/\\s]+/[^\\s]+$" })),
	thinkingLevel: Type.Optional(Type.Union([Type.Literal("off"), Type.Literal("minimal"), Type.Literal("low"), Type.Literal("medium"), Type.Literal("high"), Type.Literal("xhigh"), Type.Literal("max")])),
}, { additionalProperties: false });
type Choice = { value: string; label: string; description: string };
type AgentMessage = ContextWithSystemEvent["messages"][number];
type Opening = { focus: boolean; ready: Promise<string> };

async function pick(ctx: ExtensionCommandContext, title: string, choices: Choice[]): Promise<string | undefined> {
	return ctx.ui.custom((tui, theme, _keys, done) => {
		const view = new Container();
		view.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
		view.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
		const list = new SelectList(choices, Math.min(choices.length, 8), {
			selectedPrefix: (text) => theme.fg("accent", text), selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text), scrollInfo: (text) => theme.fg("dim", text), noMatch: (text) => theme.fg("warning", text),
		});
		list.onSelect = (item) => done(item.value);
		list.onCancel = () => done(undefined);
		view.addChild(list);
		view.addChild(new Text("Enter selects. Esc cancels.", 1, 0));
		view.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
		return { render: (width) => view.render(width), invalidate: () => view.invalidate(), handleInput: (data) => { list.handleInput(data); tui.requestRender(); } };
	});
}

function withoutReviewDeclarations(messages: readonly AgentMessage[]): AgentMessage[] {
	return messages.map(message => {
		if (message.role !== "system") return message;
		const { toolsAdded, toolsRemoved, ...rest } = message;
		const added = toolsAdded?.filter(tool => tool.name !== START_REVIEW) ?? [];
		const removed = toolsRemoved?.filter(tool => tool.name !== START_REVIEW) ?? [];
		return { ...rest, ...(added.length ? { toolsAdded: added } : {}), ...(removed.length ? { toolsRemoved: removed } : {}) };
	});
}

function requireCacheSafePreparation(ctx: ExtensionContext, messages: readonly AgentMessage[]): void {
	const compat = ctx.model?.compat;
	if (!compat || !("supportsAdditionalTools" in compat) || !compat.supportsAdditionalTools || !("supportsMidConvoSystemMessages" in compat) || !compat.supportsMidConvoSystemMessages) throw new Error("This author model cannot declare a temporary review tool near the end of the request. Choose a model with additional-tools and mid-conversation support.");
	if (hasNonAdditiveToolChanges(messages)) throw new Error("Other tool removals or redefinitions prevent cache-safe review preparation in this conversation. Start a new author session rather than rewriting its tool history.");
}

export default function codeReview(pi: ExtensionAPI): void {
	const instructionsFile = fileURLToPath(new URL("./instructions.md", import.meta.url));
	const instructions = readFileSync(instructionsFile, "utf8");
	pi.registerFlag("review-initialize", { type: "boolean", description: "Apply native thinking defaults when opening a new saved reviewer" });
	let context: ExtensionContext | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let polling = false;
	let commandPending = false;
	const reportedErrors = new Map<string, string>();
	const pendingReports = new Set<string>();
	const openings = new Map<string, Opening>();

	function withdraw(): void {
		const registered = pi.getAllTools().find(tool => tool.name === START_REVIEW);
		if (!registered || registered.exposure === "hidden") return;
		pi.setActiveTools(pi.getActiveTools().filter(name => name !== START_REVIEW));
		pi.registerTool({ ...startReview, exposure: "hidden", defaultActive: false });
	}

	function activate(ctx: ExtensionContext): void {
		requireCacheSafePreparation(ctx, withoutReviewDeclarations(ctx.sessionManager.buildSessionProjection().messages));
		pi.registerTool(startReview);
		pi.setActiveTools([...pi.getActiveTools(), START_REVIEW]);
		if (!pi.getActiveTools().includes(START_REVIEW)) {
			withdraw();
			throw new Error("The author tool loadout excludes start_review. Include it in --tools or defaultTools, or remove the exclusion before preparing a review.");
		}
	}

	function restorePreparation(ctx: ExtensionContext): void {
		if (origin(ctx.sessionManager.getBranch()) || !pendingPreparation(ctx.sessionManager.getBranch())) { withdraw(); return; }
		try { activate(ctx); } catch (error) {
			withdraw();
			ctx.ui.notify(`${error instanceof Error ? error.message : String(error)} Preparation is retained. Switch models or use /review cancel.`, "warning");
		}
	}

	function show(ctx: ExtensionContext): void {
		ctx.ui.setWidget("code-review", origin(ctx.sessionManager.getBranch()) ? [ctx.sessionManager.getSessionName() || "Independent review"] : undefined);
	}

	function invalidateFinalization(ctx: ExtensionContext): void {
		const path = ctx.sessionManager.getBranch();
		const requestId = origin(path) ? pendingFinalization(path) : undefined;
		if (!requestId) return;
		pi.appendEntry(FAILED, { requestId });
		ctx.ui.notify("Finalization interrupted. Retry /end-review.", "warning");
	}

	async function receive(): Promise<void> {
		const active = context;
		if (polling || !active || origin(active.sessionManager.getBranch())) return;
		polling = true;
		try {
			for (const link of links(active.sessionManager.getBranch())) {
				try {
					const entries = await readSession(link.reviewer);
					for (const report of publications(entries)) {
						if (context !== active) return;
						const path = active.sessionManager.getBranch();
						const author = sessionRef(active.sessionManager);
						if (author.id !== report.origin.author.id || author.file !== report.origin.author.file || report.origin.anchor !== link.anchor || !path.some((entry) => entry.id === link.anchor)) continue;
						const key = `${link.reviewer.id}:${report.id}`;
						if (hasReport(path, link.reviewer.id, report.id)) { pendingReports.delete(key); continue; }
						if (pendingReports.has(key)) continue;
						pendingReports.add(key);
						pi.sendMessage({ customType: REPORT, content: `## Review received\n\n${link.title}\n\nEvaluate this report against current code and the agreed task scope before acting on any finding.\n\n${report.text}`, display: true, details: { reviewerId: link.reviewer.id, publicationId: report.id } }, { triggerTurn: true, deliverAs: "steer" });
					}
					reportedErrors.delete(link.reviewer.file);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					if (context === active && reportedErrors.get(link.reviewer.file) !== message) active.ui.notify(`Review return is pending for ${link.title}: ${message}`, "warning");
					reportedErrors.set(link.reviewer.file, message);
				}
			}
		} finally { polling = false; }
	}

	pi.on("session_start", async (event, ctx) => {
		context = ctx; reportedErrors.clear(); pendingReports.clear();
		if (timer) clearInterval(timer);
		const path = ctx.sessionManager.getBranch();
		if (origin(path)) {
			pi.registerCommand("end-review", endReview);
			if (event.reason === "startup" && pi.getFlag("review-initialize") && ctx.model) {
				await pi.setModel(ctx.model);
			}
		}
		if (ctx.isIdle()) invalidateFinalization(ctx);
		restorePreparation(ctx); show(ctx);
		timer = setInterval(() => { void receive(); }, 1_000);
		timer.unref();
		await receive();
	});
	pi.on("session_tree", async (_event, ctx) => { context = ctx; pendingReports.clear(); invalidateFinalization(ctx); restorePreparation(ctx); show(ctx); await receive(); });
	pi.on("model_select", (_event, ctx) => { restorePreparation(ctx); });
	pi.on("session_shutdown", () => { if (timer) clearInterval(timer); timer = undefined; context = undefined; pendingReports.clear(); });
	pi.on("agent_settled", (_event, ctx) => { context = ctx; pendingReports.clear(); });

	pi.on("context_with_system", (event, ctx) => {
		const messages = withoutReviewDeclarations(event.messages);
		if (pi.getActiveTools().includes(START_REVIEW)) {
			requireCacheSafePreparation(ctx, messages);
			const definition = getCurrentTools(event.messages).find(tool => tool.name === START_REVIEW);
			if (!definition) throw new Error("The active review tool has no native declaration.");
			messages.push({ role: "system", content: "", timestamp: Date.now(), toolsAdded: [definition] });
		}
		return { messages };
	});
	pi.on("before_agent_start", (event, ctx) => {
		if (origin(ctx.sessionManager.getBranch())) event.systemPromptOptions.sections.code_review = `Review guide: ${instructionsFile}\n\n${instructions}`;
	});
	pi.on("agent_before_settle", (event, ctx) => {
		const path = ctx.sessionManager.getBranch();
		if (!origin(path)) return;
		const requestId = pendingFinalization(path);
		if (!requestId) return;
		const answer = event.outcome === "completed" ? finalAnswer(path, requestId) : undefined;
		if (!answer) {
			ctx.ui.notify("No complete report. Retry /end-review.", "warning");
			return { entries: [{ type: "custom", customType: FAILED, data: { requestId } }] };
		}
		ctx.ui.notify("Report saved for author.", "info");
		return { entries: [{ type: "custom", customType: FINALIZED, data: { requestId, messageId: answer.messageId } }] };
	});

	const endReview = {
		description: "Generate the complete updated review report and return it to its author",
		handler: async (args, ctx) => {
			if (args.trim()) { ctx.ui.notify("Usage: /end-review", "error"); return; }
			const path = ctx.sessionManager.getBranch();
			if (!origin(path)) { ctx.ui.notify("Run /end-review in the reviewer pane.", "warning"); return; }
			if (!ctx.isIdle() || ctx.hasPendingMessages()) { ctx.ui.notify("Wait for the reviewer to finish responding.", "warning"); return; }
			if (alreadyFinalized(path)) { ctx.ui.notify("Report already saved.", "info"); return; }
			pi.appendEntry(REQUEST, {});
			pi.sendUserMessage("Finalize this review for return to the author now. Produce the complete updated report, not merely the last discussion reply. Include selected scope and code revision, all remaining findings with locations and rationale, resolved concerns, checks and observable results, and uncertainty or unreviewed areas. Reconcile the whole discussion. Remain review-only. Do not change files, spawn agents or publish comments. The extension returns this complete answer after successful settlement.");
		},
	} satisfies Parameters<ExtensionAPI["registerCommand"]>[1];

	function openReviewer(ctx: ExtensionContext, ref: SessionRef, mode: "launch" | "resume"): Promise<string> {
		const pending = openings.get(ref.file);
		if (pending) {
			if (mode === "resume") pending.focus = true;
			return pending.ready;
		}
		const operation: Opening = {
			focus: mode === "resume",
			ready: Promise.resolve().then(async () => {
				const panes = new ReviewPanes(pi, ctx.cwd);
				const existing = mode === "resume" ? await panes.live(ref) : undefined;
				if (existing) { await panes.focus(existing); return existing; }
				return panes.open(ctx, ref, extensionFile, operation);
			}).finally(() => openings.delete(ref.file)),
		};
		openings.set(ref.file, operation);
		return operation.ready;
	}

	async function launch(ctx: ExtensionContext, scope: Scope): Promise<void> {
		const settings = pi.getSettings();
		const defaults = Value.Parse(ReviewerDefaultsSchema, "codeReview" in settings ? settings.codeReview : {});
		const author = sessionRef(ctx.sessionManager);
		const reviewer = SessionManager.create(ctx.cwd, join(ctx.sessionManager.getSessionDir(), "reviewers"));
		const ref = sessionRef(reviewer);
		pi.appendEntry(LINK, { reviewer: ref, title: scope.title });
		const anchor = ctx.sessionManager.getLeafId();
		if (!anchor) throw new Error("Pi did not create a review link.");
		withdraw();
		reviewer.appendCustomEntry(ORIGIN, { author, anchor });
		if (defaults.model) {
			const separator = defaults.model.indexOf("/");
			reviewer.appendModelChange(defaults.model.slice(0, separator), defaults.model.slice(separator + 1));
		}
		if (defaults.thinkingLevel) reviewer.appendThinkingLevelChange(defaults.thinkingLevel);
		reviewer.appendSessionInfo(`Review: ${scope.title}`);
		reviewer.appendMessage({ role: "user", content: reviewRequest(scope), timestamp: Date.now() });
		const panes = new ReviewPanes(pi, ctx.cwd);
		const pane = await openReviewer(ctx, ref, "launch");
		await panes.begin(pane);
		ctx.ui.notify("Review started.", "info");
	}

	const startReview: ToolDefinition<typeof ScopeInputSchema> = {
		name: START_REVIEW, label: "Start independent review", executionMode: "sequential",
		description: "Launch one fresh independent reviewer after the user requests /review. Submit the factual agreed scope across repositories and other files/folders, plus relevant requirements. Do not include author conclusions or private chat. Clarify scope in the author conversation before calling. Comparisons capture exact base/head trees. This tool withdraws once a saved review is created; use /review resume if pane startup fails.",
		parameters: ScopeInputSchema,
		async execute(_id, input, signal, _onUpdate, ctx) {
			if (!inHerdr()) throw new Error("Open /review in a Herdr-managed author pane.");
			const requestId = pendingPreparation(ctx.sessionManager.getBranch());
			if (!requestId || origin(ctx.sessionManager.getBranch())) throw new Error("Run /review in the author pane before submitting scope.");
			const author = sessionRef(ctx.sessionManager);
			const scope = await captureScope(pi.exec, ctx.cwd, input);
			signal?.throwIfAborted();
			const activeContext = context;
			const active = activeContext && sessionRef(activeContext.sessionManager);
			if (!activeContext || !active || active.id !== author.id || active.file !== author.file || pendingPreparation(activeContext.sessionManager.getBranch()) !== requestId) throw new Error("Review preparation changed before launch. Submit scope for the current author branch.");
			await launch(ctx, scope);
			return { content: [{ type: "text", text: `Independent review started: ${scope.title}. The saved reviewer contains only the factual scope. Continue your work or use /review resume to discuss findings.` }], details: undefined };
		},
	};

	async function resume(ctx: ExtensionCommandContext, link: Link): Promise<void> {
		if (!inHerdr()) throw new Error("Resume reviews from a Herdr-managed author pane.");
		const entries = await readSession(link.reviewer);
		const binding = origin(branch(entries));
		const author = sessionRef(ctx.sessionManager);
		if (!binding || binding.author.id !== author.id || binding.author.file !== author.file || binding.anchor !== link.anchor) throw new Error("This saved reviewer does not belong to the selected author link.");
		await openReviewer(ctx, link.reviewer, "resume");
		await receive();
	}

	async function savedReview(ctx: ExtensionCommandContext, all: Link[], id?: string): Promise<void> {
		if (!all.length) throw new Error("This author session has no saved reviews.");
		let chosen: Link | undefined;
		if (id) chosen = all.find((link) => link.anchor === id);
		else {
			const selection = await pick(ctx, "Saved reviews", [...all].reverse().map((link) => ({ value: link.anchor, label: link.title, description: `${link.timestamp} | ${link.anchor}` })));
			if (!selection) return;
			chosen = all.find((link) => link.anchor === selection);
		}
		if (!chosen) throw new Error("Choose a review ID from /review list.");
		await resume(ctx, chosen);
	}

	pi.registerCommand("review", {
		description: "Prepare a multi-location independent review, or resume a saved reviewer",
		getArgumentCompletions: async prefix => prefix.startsWith("resume ") && context
			? links(context.sessionManager.getEntries()).map(link => ({ value: `resume ${link.anchor}`, label: link.title })).filter(item => item.value.startsWith(prefix))
			: ["resume", "list", "cancel"].filter(value => value.startsWith(prefix)).map(value => ({ value, label: value })),
		handler: async (args, ctx) => {
			if (commandPending) { ctx.ui.notify("A review command is already open. Finish it before starting another.", "warning"); return; }
			commandPending = true;
			try {
				if (origin(ctx.sessionManager.getBranch())) throw new Error("Start or resume reviews from the author pane. Use /end-review here.");
				const text = args.trim();
				const all = links(ctx.sessionManager.getEntries());
				if (text === "list") { await savedReview(ctx, all); return; }
				const resumeRequest = /^resume(?:\s+(\S+))?$/.exec(text);
				if (resumeRequest) { await savedReview(ctx, all, resumeRequest[1] || all.at(-1)?.anchor); return; }
				if (!ctx.isIdle() || ctx.hasPendingMessages()) throw new Error("Wait for the author to finish responding before changing review preparation.");
				const pending = pendingPreparation(ctx.sessionManager.getBranch());
				if (text === "cancel") {
					if (pending) pi.appendEntry(PREPARATION_CANCELLED, { requestId: pending });
					withdraw(); ctx.ui.notify(pending ? "Review preparation cancelled." : "No review preparation is active.", "info"); return;
				}
				if (!inHerdr()) throw new Error("Open /review in a Herdr-managed author pane.");
				if (pending) throw new Error("Review preparation is already active. Discuss its scope here, or use /review cancel before starting another.");
				activate(ctx);
				pi.appendEntry(PREPARING, {});
				pi.sendUserMessage(`Prepare an independent review of our work. Use this author conversation to identify the relevant repositories, committed ranges, working changes and files/folders outside Git. There is no single-repository restriction. Include relevant factual requirements, not your review conclusions or private conversation. Ask only about ambiguity that changes scope. Once scope is clear, call ${START_REVIEW} with the factual scope. Do not review the work yourself instead of launching. Use paths for unchanged integration context and filters to exclude unrelated changes. The user can cancel preparation with /review cancel.\n\nUser request:\n${text || "Propose the scope from our current work and clarify any decision-changing ambiguity."}`);
			} catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
			finally { commandPending = false; }
		},
	});

	pi.registerMessageRenderer(REPORT, (message) => new Markdown(typeof message.content === "string" ? message.content : message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n"), 1, 0, getMarkdownTheme()));
}
