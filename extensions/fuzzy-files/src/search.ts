import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Fzf, type FzfResultItem } from "fzf";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { displayPath } from "./utils.js";

export const MAX_SUGGESTIONS = 30;
const CACHE_TTL_MS = 30_000;
const FD_TIMEOUT_MS = 10_000;
const FD_BASE_ARGS = [
	"--hidden",
	"--exclude",
	".git",
	"--exclude",
	"node_modules",
	"--exclude",
	".next",
	"--exclude",
	"dist",
	"--exclude",
	"build",
	"--exclude",
	"target",
	"--exclude",
	".venv",
	"--exclude",
	"vendor",
	".",
];

export type SearchEntry = {
	absPath: string;
	display: string;
	isDirectory: boolean;
};

type Cache = {
	cwd: string;
	entries: SearchEntry[];
	timestamp: number;
};

let cache: Cache | undefined;
let scanPromise: Promise<SearchEntry[]> | undefined;
let loadErrorShown = false;

async function getRoots(cwd: string): Promise<string[]> {
	const home = homedir();
	const roots = [cwd, resolve(home, ".pi")];
	const projectsDir = resolve(home, "projects");

	try {
		const entries = await readdir(projectsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) roots.push(resolve(projectsDir, entry.name));
		}
	} catch {
		// No ~/projects, or not readable.
	}

	return [...new Set(roots.map((root) => resolve(root)))];
}

async function scanType(pi: ExtensionAPI, root: string, type: "f" | "d"): Promise<string[]> {
	const result = await pi.exec("fd", ["--type", type, ...FD_BASE_ARGS], { cwd: root, timeout: FD_TIMEOUT_MS });
	if (result.code !== 0) return [];
	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((rel) => resolve(root, rel));
}

async function scanEntries(pi: ExtensionAPI, cwd: string): Promise<SearchEntry[]> {
	const roots = await getRoots(cwd);
	const byPath = new Map<string, SearchEntry>();

	for (const root of roots) {
		for (const absPath of await scanType(pi, root, "d")) {
			byPath.set(absPath, { absPath, display: displayPath(absPath, cwd), isDirectory: true });
		}
		for (const absPath of await scanType(pi, root, "f")) {
			if (!byPath.has(absPath)) {
				byPath.set(absPath, { absPath, display: displayPath(absPath, cwd), isDirectory: false });
			}
		}
	}

	return [...byPath.values()];
}

export async function getEntries(pi: ExtensionAPI, cwd: string, notify: (message: string) => void): Promise<SearchEntry[]> {
	const now = Date.now();
	if (cache && cache.cwd === cwd && now - cache.timestamp < CACHE_TTL_MS) return cache.entries;

	scanPromise ??= scanEntries(pi, cwd)
		.then((entries) => {
			cache = { cwd, entries, timestamp: Date.now() };
			loadErrorShown = false;
			return entries;
		})
		.catch((error: unknown) => {
			if (!loadErrorShown) {
				loadErrorShown = true;
				notify(`fuzzy-files: scan failed: ${error instanceof Error ? error.message : String(error)}`);
			}
			return cache?.entries ?? [];
		})
		.finally(() => {
			scanPromise = undefined;
		});

	return scanPromise;
}

export function rankEntries(entries: SearchEntry[], token: string, maxResults = MAX_SUGGESTIONS): SearchEntry[] {
	if (!token.trim()) return entries.slice(0, maxResults);

	const fzf = new Fzf<SearchEntry[]>(entries, {
		selector: (entry: SearchEntry) => entry.display,
		fuzzy: "v2",
		limit: maxResults,
	});

	return fzf.find(token.replace(/\s+/g, "")).map((result: FzfResultItem<SearchEntry>) => result.item);
}
