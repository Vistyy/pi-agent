import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type AutocompleteItem,
	type AutocompleteProvider,
	type AutocompleteSuggestions,
	fuzzyFilter,
} from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { basename, dirname, relative, resolve } from "node:path";
import { readdir } from "node:fs/promises";

const MAX_SUGGESTIONS = 30;
const CACHE_TTL_MS = 30_000;
const FD_TIMEOUT_MS = 10_000;

const FD_ARGS = [
	"--type",
	"f",
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

type Cache = {
	cwd: string;
	paths: string[];
	timestamp: number;
};

let cache: Cache | undefined;
let scanPromise: Promise<string[]> | undefined;
let loadErrorShown = false;

function extractAtToken(textBeforeCursor: string): string | undefined {
	const match = textBeforeCursor.match(/(?:^|[ \t])@([^\s@]*)$/);
	return match?.[1];
}

async function getRoots(cwd: string): Promise<string[]> {
	const home = homedir();
	const roots = [cwd, resolve(home, ".pi")];
	const projectsDir = resolve(home, "projects");

	try {
		const entries = await readdir(projectsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				roots.push(resolve(projectsDir, entry.name));
			}
		}
	} catch {
		// No ~/projects, or not readable.
	}

	return [...new Set(roots.map((root) => resolve(root)))];
}

async function scanFiles(pi: ExtensionAPI, cwd: string): Promise<string[]> {
	const roots = await getRoots(cwd);
	const paths: string[] = [];

	for (const root of roots) {
		const result = await pi.exec("fd", FD_ARGS, { cwd: root, timeout: FD_TIMEOUT_MS });
		if (result.code !== 0) {
			continue;
		}

		for (const line of result.stdout.split("\n")) {
			const rel = line.trim();
			if (rel) {
				paths.push(resolve(root, rel));
			}
		}
	}

	return [...new Set(paths)];
}

async function getFiles(pi: ExtensionAPI, cwd: string, notify: (message: string) => void): Promise<string[]> {
	const now = Date.now();
	if (cache && cache.cwd === cwd && now - cache.timestamp < CACHE_TTL_MS) {
		return cache.paths;
	}

	scanPromise ??= scanFiles(pi, cwd)
		.then((paths) => {
			cache = { cwd, paths, timestamp: Date.now() };
			loadErrorShown = false;
			return paths;
		})
		.catch((error: unknown) => {
			if (!loadErrorShown) {
				loadErrorShown = true;
				notify(`fuzzy-files: scan failed: ${error instanceof Error ? error.message : String(error)}`);
			}
			return cache?.paths ?? [];
		})
		.finally(() => {
			scanPromise = undefined;
		});

	return scanPromise;
}

function displayPath(absPath: string, cwd: string): string {
	const home = homedir();
	const relCwd = relative(cwd, absPath);
	if (relCwd && !relCwd.startsWith("..") && !relCwd.startsWith("/")) {
		return relCwd;
	}
	if (absPath.startsWith(home + "/")) {
		return `~/${absPath.slice(home.length + 1)}`;
	}
	return absPath;
}

function withTrailingSlash(path: string): string {
	return path.endsWith("/") ? path : `${path}/`;
}

function filenameRank(absPath: string, token: string): number {
	const fileName = basename(absPath).toLowerCase();
	const query = token.toLowerCase();

	if (!query) return 3;
	if (fileName === query) return 0;
	if (fileName.startsWith(query)) return 1;
	if (fileName.includes(query)) return 2;
	return 3;
}

function rankByFilename(paths: string[], token: string): string[] {
	return paths
		.map((path, index) => ({ path, index, rank: filenameRank(path, token.trim()) }))
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map(({ path }) => path);
}

function toItem(absPath: string, cwd: string): AutocompleteItem {
	return {
		value: `@${absPath}`,
		label: basename(absPath),
		description: withTrailingSlash(displayPath(dirname(absPath), cwd)),
	};
}

function createProvider(pi: ExtensionAPI, ctx: { cwd: string; ui: { notify: (message: string, type?: "error") => void } }, current: AutocompleteProvider): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
			const currentLine = lines[cursorLine] ?? "";
			const token = extractAtToken(currentLine.slice(0, cursorCol));
			if (token === undefined) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const files = await getFiles(pi, ctx.cwd, (message) => ctx.ui.notify(message, "error"));
			if (options.signal.aborted || files.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const matched = token.trim()
				? rankByFilename(fuzzyFilter(files, token, (path) => displayPath(path, ctx.cwd)), token)
				: files;

			if (matched.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			return {
				items: matched.slice(0, MAX_SUGGESTIONS).map((path) => toItem(path, ctx.cwd)),
				prefix: `@${token}`,
			};
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		void getFiles(pi, ctx.cwd, (message) => ctx.ui.notify(message, "error"));
		ctx.ui.addAutocompleteProvider((current) => createProvider(pi, ctx, current));
	});
}
