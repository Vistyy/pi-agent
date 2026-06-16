import { homedir } from "node:os";
import { relative } from "node:path";

export function extractAtToken(textBeforeCursor: string): string | undefined {
	const match = textBeforeCursor.match(/(?:^|[ \t])@([^\s@]*)$/);
	return match?.[1];
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
