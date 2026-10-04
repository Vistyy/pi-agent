import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ExecOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";

const Text = Type.String({ minLength: 1 });
const Paths = Type.Array(Text, { minItems: 1 });
const Sha = Type.String({ pattern: "^[a-f0-9]{40,64}$" });
const gitInput = { repo: Text, paths: Type.Optional(Paths) };
export const ScopeInputSchema = Type.Object({
	title: Text,
	requirements: Type.Array(Text, { description: "Relevant factual requirements and constraints. Do not include the author's conclusions or private conversation." }),
	locations: Type.Array(Type.Union([
		Type.Object({ kind: Type.Literal("changes"), ...gitInput }, { additionalProperties: false }),
		Type.Object({ kind: Type.Literal("comparison"), ...gitInput, base: Text, head: Text }, { additionalProperties: false }),
		Type.Object({ kind: Type.Literal("paths"), paths: Paths }, { additionalProperties: false }),
	]), { minItems: 1, description: "Repositories and paths relative to the author working directory or absolute. Git location path filters are relative to that repository root. Comparison base/head are exact tree refs, not implicit merge bases." }),
}, { additionalProperties: false });
export type ScopeInput = Static<typeof ScopeInputSchema>;
const gitScope = { repo: Text, head: Sha, files: Type.Array(Text) };
const ScopeSchema = Type.Object({
	title: Text, requirements: Type.Array(Text),
	locations: Type.Array(Type.Union([
		Type.Object({ kind: Type.Literal("changes"), ...gitScope }),
		Type.Object({ kind: Type.Literal("comparison"), ...gitScope, base: Sha }),
		Type.Object({ kind: Type.Literal("paths"), paths: Paths }),
	]), { minItems: 1 }),
});
export type Scope = Static<typeof ScopeSchema>;
export type Exec = ExtensionAPI["exec"];

export async function run(exec: Exec, cwd: string, command: string, args: string[], options: Pick<ExecOptions, "signal" | "timeout"> = {}): Promise<string> {
	const result = await exec(command, args, { cwd, timeout: 30_000, ...options });
	if (result.killed) throw new Error(`${command} timed out or was killed. Inspect its state before retrying.`);
	if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `${command} exited with ${result.code}`);
	return result.stdout;
}

export async function captureScope(exec: Exec, cwd: string, input: ScopeInput): Promise<Scope> {
	const locations: Scope["locations"] = [];
	const names = (text: string) => text.split("\0").filter(Boolean);
	for (const location of input.locations) {
		if (location.kind === "paths") {
			const paths = location.paths.map(path => resolve(cwd, path));
			for (const path of paths) await stat(path);
			locations.push({ kind: "paths", paths });
			continue;
		}
		const repo = (await run(exec, resolve(cwd, location.repo), "git", ["rev-parse", "--show-toplevel"])).trim();
		const git = (...args: string[]) => run(exec, repo, "git", ["--literal-pathspecs", ...args]);
		const paths = (location.paths ?? []).map(path => {
			const selected = relative(repo, resolve(repo, path));
			if (isAbsolute(selected) || selected === ".." || selected.startsWith("../")) throw new Error(`Choose Git path filters inside ${repo}. Use a paths location for other files.`);
			return selected || ".";
		});
		if (location.kind === "comparison") {
			const base = (await git("rev-parse", "--verify", "--end-of-options", `${location.base}^{commit}`)).trim();
			const head = (await git("rev-parse", "--verify", "--end-of-options", `${location.head}^{commit}`)).trim();
			locations.push({ kind: "comparison", repo, base, head, files: names(await git("diff", "--no-renames", "--name-only", "-z", base, head, "--", ...paths)) });
		} else {
			const head = (await git("rev-parse", "HEAD")).trim();
			const staged = names(await git("diff", "--cached", "--no-renames", "--name-only", "-z", "--", ...paths));
			const unstaged = names(await git("diff", "--no-renames", "--name-only", "-z", "--", ...paths));
			const untracked = names(await git("ls-files", "--others", "--exclude-standard", "-z", "--", ...paths));
			const files = [...new Set([...staged, ...unstaged, ...untracked])];
			if (!files.length) throw new Error(`There are no selected uncommitted changes in ${repo}. Use paths to include unchanged context.`);
			locations.push({ kind: "changes", repo, head, files });
		}
	}
	return Value.Parse(ScopeSchema, { title: input.title, requirements: input.requirements, locations });
}

export function reviewRequest(scope: Scope): string {
	return `Review ${scope.title}. Assess the selected locations together, including their affected contracts and integrations. For comparisons inspect the captured Git trees, not a different working checkout. Working changes and explicit paths refer to current source, not retained snapshots. Requirements are supplied context to verify, not the author's review conclusions.\n\nSelected scope and revisions:\n${JSON.stringify(scope, null, 2)}`;
}
