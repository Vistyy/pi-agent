import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ExecOptions, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildSessionContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { run } from "./scope.ts";
import { branch, readSession, type SessionRef } from "./sessions.ts";

const AgentSchema = Type.Object({
	pane_id: Type.String(), agent: Type.Optional(Type.Union([Type.String(), Type.Null()])), launch_pending: Type.Optional(Type.Boolean()),
	agent_session: Type.Optional(Type.Union([Type.Object({ kind: Type.Union([Type.Literal("path"), Type.Literal("id")]), value: Type.String() }), Type.Null()])),
});

export function inHerdr(): boolean {
	return process.env.HERDR_ENV === "1" && Boolean(process.env.HERDR_PANE_ID);
}

export class ReviewPanes {
	constructor(private readonly pi: ExtensionAPI, private readonly cwd: string) {}

	private async command(args: string[], options?: Pick<ExecOptions, "signal" | "timeout">): Promise<unknown> {
		return JSON.parse(await run(this.pi.exec, this.cwd, process.env.HERDR_BIN_PATH || "herdr", args, options));
	}

	async live(ref: SessionRef): Promise<string | undefined> {
		const response = Value.Parse(Type.Object({ result: Type.Object({ agents: Type.Array(AgentSchema) }) }), await this.command(["agent", "list"]));
		const candidates = response.result.agents.filter((agent) => agent.agent === "pi" || (!agent.agent && agent.launch_pending));
		const matches: string[] = [];
		for (const agent of candidates) {
			const identity = agent.agent_session;
			if (identity && (identity.kind === "path" ? resolve(identity.value) !== resolve(ref.file) : identity.value !== ref.id)) continue;
			if (agent.launch_pending) throw new Error(`Herdr startup is still pending in ${agent.pane_id}. Wait for it before resuming.`);
			const processes = Value.Parse(Type.Object({ result: Type.Object({ process_info: Type.Object({ foreground_processes: Type.Array(Type.Object({ pid: Type.Integer(), name: Type.String() })) }) }) }), await this.command(["pane", "process-info", "--pane", agent.pane_id]));
			const alive = processes.result.process_info.foreground_processes.some((processInfo) => {
				if (processInfo.name !== "pi") return false;
				try { process.kill(processInfo.pid, 0); return true; } catch { return false; }
			});
			if (!alive) continue;
			if (!identity) throw new Error(`Cannot verify the Pi session in ${agent.pane_id}. Wait for Herdr's Pi integration before resuming.`);
			matches.push(agent.pane_id);
		}
		if (matches.length > 1) throw new Error("This reviewer already has multiple live writers. Resolve them before resuming.");
		return matches[0];
	}

	async focus(pane: string): Promise<void> {
		await this.command(["agent", "focus", pane]);
	}

	async open(ctx: ExtensionContext, ref: SessionRef, extension: string, policy: { focus: boolean }): Promise<string> {
		if (!inHerdr()) throw new Error("Open /review in a Herdr-managed author pane.");
		const current = Value.Parse(Type.Object({ result: Type.Object({ pane: Type.Object({ pane_id: Type.String() }) }) }), await this.command(["pane", "current", "--current"]));
		const paneId = current.result.pane.pane_id;
		const layout = Value.Parse(Type.Object({ result: Type.Object({ layout: Type.Object({ area: Type.Object({ width: Type.Number() }) }) }) }), await this.command(["pane", "layout", "--pane", paneId]));
		const entries = await readSession(ref);
		const saved = buildSessionContext(entries);
		const split = Value.Parse(Type.Object({ result: Type.Object({ pane: Type.Object({ pane_id: Type.String() }) }) }), await this.command([
			"pane", "split", "--pane", paneId, "--direction", layout.result.layout.area.width >= 150 ? "right" : "down",
			"--cwd", ctx.cwd, "--env", `PI_CODING_AGENT_DIR=${getAgentDir()}`,
			...(process.env.PI_OFFLINE ? ["--env", `PI_OFFLINE=${process.env.PI_OFFLINE}`] : []), "--no-focus",
		]));
		const created = split.result.pane.pane_id;
		const args = ["agent", "start", `review-${Buffer.from(created).toString("hex")}`, "--kind", "pi", "--pane", created,
			"--", "--session", ref.file, "--extension", extension, "--exclude-tools", "name_session,tuicr_review"];
		if (saved.model) args.push("--model", `${saved.model.provider}/${saved.model.modelId}`);
		if (branch(entries).some((entry) => entry.type === "thinking_level_change")) args.push("--thinking", saved.thinkingLevel);
		else args.push("--review-initialize");
		args.push(ctx.isProjectTrusted() ? "--approve" : "--no-approve");
		const controller = new AbortController();
		let closed = false, focused = false;
		const watch = async () => {
			try {
				while (!controller.signal.aborted) {
					const listing = Value.Parse(Type.Object({ result: Type.Object({ panes: Type.Array(AgentSchema) }) }), await this.command(["pane", "list"], { signal: controller.signal }));
					const pane = listing.result.panes.find(pane => pane.pane_id === created);
					if (!pane) { closed = true; controller.abort(); return; }
					if (policy.focus && !focused && pane.agent === "pi") { await this.focus(created); focused = true; }
					await delay(100, undefined, { signal: controller.signal });
				}
			} catch (error) {
				if (!controller.signal.aborted) throw error;
			}
		};
		try {
			await Promise.all([
				this.command(args, { signal: controller.signal, timeout: 35_000 }).finally(() => controller.abort()),
				watch(),
			]);
		} catch (error) {
			if (!closed) throw new Error(`Reviewer startup did not finish in ${created}. The saved review is retained. Inspect the pane before resuming. ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			controller.abort();
		}
		if (closed) throw new Error("Reviewer pane was closed while opening. The saved review is retained.");
		if (policy.focus && !focused) await this.focus(created);
		return created;
	}

	async begin(pane: string): Promise<void> {
		await this.command(["agent", "prompt", pane, "Start review."]);
	}
}
