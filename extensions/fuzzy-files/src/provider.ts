import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";
import { basename, dirname } from "node:path";
import { rankIndex, type SearchEntry, type SearchSession } from "./search.js";
import { extractAtToken, withTrailingSlash } from "./utils.js";

function toItem(entry: SearchEntry): AutocompleteItem {
  const label = entry.isDirectory ? withTrailingSlash(basename(entry.absPath)) : basename(entry.absPath);
  const value = entry.isDirectory ? `@${withTrailingSlash(entry.absPath)}` : `@${entry.absPath}`;
  const description = entry.isDirectory ? withTrailingSlash(entry.display) : withTrailingSlash(dirname(entry.display));
  return { value, label, description };
}

export function createProvider(_pi: ExtensionAPI, session: SearchSession, current: AutocompleteProvider): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const currentLine = lines[cursorLine] ?? "";
      const token = extractAtToken(currentLine.slice(0, cursorCol));
      if (token === undefined) return current.getSuggestions(lines, cursorLine, cursorCol, options);

      const index = session.getReadyIndex();
      if (options.signal.aborted || !index || index.entries.length === 0) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      const matched = rankIndex(index, token);
      if (matched.length === 0) return current.getSuggestions(lines, cursorLine, cursorCol, options);
      return { items: matched.map(toItem), prefix: `@${token}` };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}
