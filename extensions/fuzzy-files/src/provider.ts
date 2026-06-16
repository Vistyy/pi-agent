import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";
import { basename, dirname } from "node:path";
import { getEntries, rankEntries, type SearchEntry } from "./search.js";
import { extractAtToken, withTrailingSlash } from "./utils.js";

type SessionContext = {
	cwd: string;
	ui: { notify: (message: string, type?: "error") => void };
};

function toItem(entry: SearchEntry, cwd: string): AutocompleteItem {
	const label = entry.isDirectory ? withTrailingSlash(basename(entry.absPath)) : basename(entry.absPath);
	const value = entry.isDirectory ? `@${withTrailingSlash(entry.absPath)}` : `@${entry.absPath}`;
	const description = entry.isDirectory ? withTrailingSlash(entry.display) : withTrailingSlash(dirname(entry.display));
	return { value, label, description };
}

export function createProvider(pi: ExtensionAPI, ctx: SessionContext, current: AutocompleteProvider): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
			const currentLine = lines[cursorLine] ?? "";
			const token = extractAtToken(currentLine.slice(0, cursorCol));
			if (token === undefined) return current.getSuggestions(lines, cursorLine, cursorCol, options);

			const entries = await getEntries(pi, ctx.cwd, (message) => ctx.ui.notify(message, "error"));
			if (options.signal.aborted || entries.length === 0) return current.getSuggestions(lines, cursorLine, cursorCol, options);

			const matched = rankEntries(entries, token);
			if (matched.length === 0) return current.getSuggestions(lines, cursorLine, cursorCol, options);

			return {
				items: matched.map((entry) => toItem(entry, ctx.cwd)),
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
