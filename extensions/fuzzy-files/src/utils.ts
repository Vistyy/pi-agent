import { homedir } from "node:os";
import { relative } from "node:path";

export type SearchToken = { scope: "project" | "global"; marker: "@" | "@@"; query: string };

export function extractSearchToken(textBeforeCursor: string): SearchToken | undefined {
	const match = textBeforeCursor.match(/(?:^|[ \t])(@@?)([^\s@]*)$/);
	if (!match) return undefined;
	const marker = match[1] as "@" | "@@";
	return { scope: marker === "@@" ? "global" : "project", marker, query: match[2] ?? "" };
}

export function displayPath(absPath: string, cwd: string): string {
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

export function withTrailingSlash(path: string): string {
	return path.endsWith("/") ? path : `${path}/`;
}
