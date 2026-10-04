import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, test } from "vitest";
import { Value } from "typebox/value";
import { captureScope, reviewRequest, ScopeInputSchema, type Exec } from "../scope.ts";

const execute = promisify(execFile);
const exec: Exec = async (command, args, options) => {
	const result = await execute(command, args, { cwd: options?.cwd });
	return { ...result, code: 0, killed: false };
};
let root: string, payments: string, orders: string, initial: string;
const git = async (cwd: string, ...args: string[]) => (await execute("git", args, { cwd })).stdout.trim();
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "code-review-scope-"));
	payments = join(root, "payments"); orders = join(root, "orders");
	for (const cwd of [payments, orders]) {
		await mkdir(cwd); await git(cwd, "init", "-b", "main");
		await git(cwd, "config", "user.name", "Fixture"); await git(cwd, "config", "user.email", "fixture@example.invalid");
		await mkdir(join(cwd, "src")); await writeFile(join(cwd, "src", "contract.ts"), "export const version = 1;\n");
		await writeFile(join(cwd, "deleted.txt"), "old\n"); await git(cwd, "add", "."); await git(cwd, "commit", "-m", "Initial");
	}
	initial = await git(payments, "rev-parse", "HEAD");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

test("one scope captures two real repositories and a non-Git file from their non-Git parent", async () => {
	await writeFile(join(payments, "src", "contract.ts"), "export const version = 2;\n");
	await writeFile(join(orders, "src", "contract.ts"), "export const version = 2;\n");
	await writeFile(join(root, "shared.json"), '{"version":2}\n');
	const scope = await captureScope(exec, root, { title: "Contract change", requirements: ["Both services use version 2."], locations: [
		{ kind: "changes", repo: "payments" }, { kind: "changes", repo: "orders" }, { kind: "paths", paths: ["shared.json"] },
	] });
	expect(scope).toEqual({ title: "Contract change", requirements: ["Both services use version 2."], locations: [
		{ kind: "changes", repo: payments, head: initial, files: ["src/contract.ts"] },
		{ kind: "changes", repo: orders, head: await git(orders, "rev-parse", "HEAD"), files: ["src/contract.ts"] },
		{ kind: "paths", paths: [join(root, "shared.json")] },
	] });
	expect(reviewRequest(scope)).toContain('"requirements": [');
	expect(reviewRequest(scope)).toContain(payments);
	expect(reviewRequest(scope)).toContain(orders);
	expect(await readFile(join(root, "shared.json"), "utf8")).toBe('{"version":2}\n');
});

test("working inventory includes cancelling staged and unstaged changes, deletions and new files", async () => {
	await writeFile(join(payments, "src", "contract.ts"), "staged\n"); await git(payments, "add", "src/contract.ts");
	await writeFile(join(payments, "src", "contract.ts"), "export const version = 1;\n");
	await git(payments, "rm", "deleted.txt"); await writeFile(join(payments, "new file.ts"), "new\n");
	const scope = await captureScope(exec, root, { title: "Working changes", requirements: [], locations: [{ kind: "changes", repo: "payments/src" }] });
	expect(scope.locations).toEqual([{ kind: "changes", repo: payments, head: initial, files: ["deleted.txt", "src/contract.ts", "new file.ts"] }]);
});

test("Git path filters exclude unrelated changes and treat pathspec-looking names literally", async () => {
	await writeFile(join(payments, "src", "contract.ts"), "change\n");
	await writeFile(join(payments, "unrelated.txt"), "keep separate\n");
	await writeFile(join(payments, ":(glob)*"), "literal\n");
	const scope = await captureScope(exec, root, { title: "Selected work", requirements: [], locations: [
		{ kind: "changes", repo: "payments", paths: ["src"] }, { kind: "changes", repo: "payments", paths: [":(glob)*"] },
	] });
	expect(scope.locations).toEqual([
		{ kind: "changes", repo: payments, head: initial, files: ["src/contract.ts"] },
		{ kind: "changes", repo: payments, head: initial, files: [":(glob)*"] },
	]);
	await expect(captureScope(exec, root, { title: "Wrong filter", requirements: [], locations: [{ kind: "changes", repo: "payments", paths: ["../orders"] }] })).rejects.toThrow("inside");
});

test("exact committed ranges can inspect another tree without changing or requiring a clean checkout", async () => {
	await git(payments, "checkout", "-b", "topic");
	await writeFile(join(payments, "src", "contract.ts"), "topic\n"); await git(payments, "commit", "-am", "First included");
	const first = await git(payments, "rev-parse", "HEAD");
	await writeFile(join(payments, "newer.txt"), "newer\n"); await git(payments, "add", "."); await git(payments, "commit", "-m", "Latest");
	const head = await git(payments, "rev-parse", "HEAD");
	await git(payments, "checkout", "main"); await writeFile(join(payments, "src", "contract.ts"), "unfinished unrelated work\n");
	const scope = await captureScope(exec, root, { title: "Committed work", requirements: [], locations: [{ kind: "comparison", repo: "payments", base: `${first}^1`, head: "topic" }] });
	expect(scope.locations).toEqual([{ kind: "comparison", repo: payments, base: initial, head, files: ["newer.txt", "src/contract.ts"] }]);
	expect(await git(payments, "branch", "--show-current")).toBe("main");
	expect(await readFile(join(payments, "src", "contract.ts"), "utf8")).toBe("unfinished unrelated work\n");
});

test.each(["staged", "unstaged"])("%s renames retain removed and added paths while respecting selection filters", async mode => {
	if (mode === "staged") await git(payments, "mv", "src/contract.ts", "src/renamed.ts");
	else {
		await rename(join(payments, "src", "contract.ts"), join(payments, "src", "renamed.ts"));
		await git(payments, "add", "--intent-to-add", "src/renamed.ts");
	}
	for (const [paths, files] of [
		[undefined, ["src/contract.ts", "src/renamed.ts"]],
		[["src"], ["src/contract.ts", "src/renamed.ts"]],
		[["src/contract.ts"], ["src/contract.ts"]],
		[["src/renamed.ts"], ["src/renamed.ts"]],
	] satisfies [string[] | undefined, string[]][]) {
		const scope = await captureScope(exec, root, { title: "Rename", requirements: [], locations: [{ kind: "changes", repo: "payments", paths }] });
		expect(scope.locations).toEqual([{ kind: "changes", repo: payments, head: initial, files }]);
	}
});

test("committed renames retain both paths while respecting selection filters", async () => {
	await git(payments, "mv", "src/contract.ts", "src/renamed.ts"); await git(payments, "commit", "-m", "Rename contract");
	const head = await git(payments, "rev-parse", "HEAD");
	for (const [paths, files] of [
		[undefined, ["src/contract.ts", "src/renamed.ts"]],
		[["src"], ["src/contract.ts", "src/renamed.ts"]],
		[["src/contract.ts"], ["src/contract.ts"]],
		[["src/renamed.ts"], ["src/renamed.ts"]],
	] satisfies [string[] | undefined, string[]][]) {
		const scope = await captureScope(exec, root, { title: "Committed rename", requirements: [], locations: [{ kind: "comparison", repo: "payments", base: initial, head: "HEAD", paths }] });
		expect(scope.locations).toEqual([{ kind: "comparison", repo: payments, base: initial, head, files }]);
	}
});

test("an empty committed comparison retains its accurate inventory", async () => {
	const scope = await captureScope(exec, root, { title: "Same trees", requirements: [], locations: [{ kind: "comparison", repo: "payments", base: "HEAD", head: "HEAD" }] });
	expect(scope.locations).toEqual([{ kind: "comparison", repo: payments, base: initial, head: initial, files: [] }]);
});

test("explicit files and folders need no repository and support absolute paths", async () => {
	await mkdir(join(root, "config")); await writeFile(join(root, "config", "my settings.json"), "{}\n");
	const scope = await captureScope(exec, join(root, "config"), { title: "Config", requirements: [], locations: [{ kind: "paths", paths: ["my settings.json", root] }] });
	expect(scope.locations).toEqual([{ kind: "paths", paths: [join(root, "config", "my settings.json"), root] }]);
});

test("missing explicit paths and empty working inventories fail before launch", async () => {
	await expect(captureScope(exec, root, { title: "Missing", requirements: [], locations: [{ kind: "paths", paths: ["missing"] }] })).rejects.toMatchObject({ code: "ENOENT" });
	await expect(captureScope(exec, root, { title: "Empty", requirements: [], locations: [{ kind: "changes", repo: "payments" }] })).rejects.toThrow("no selected uncommitted changes");
});

test("invalid external scope and killed lookups are rejected at their boundaries", async () => {
	expect(() => Value.Parse(ScopeInputSchema, { title: "Bad", requirements: [], locations: [] })).toThrow();
	expect(() => Value.Parse(ScopeInputSchema, { title: "Bad", requirements: [], locations: [{ kind: "comparison", repo: "payments", base: "HEAD" }] })).toThrow();
	const killed: Exec = async () => ({ code: 0, killed: true, stderr: "", stdout: "" });
	await expect(captureScope(killed, root, { title: "Killed", requirements: [], locations: [{ kind: "changes", repo: "payments" }] })).rejects.toThrow("Inspect its state before retrying");
});
