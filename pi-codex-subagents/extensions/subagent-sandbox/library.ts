import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSubagentSandbox } from "./index.js";

function libraryOrientationCacheDirectory() {
  const cacheHome = process.env.XDG_CACHE_HOME
    ? path.resolve(process.env.XDG_CACHE_HOME)
    : path.join(homedir(), ".cache");
  return path.join(cacheHome, "pi", "library-orientation");
}

export default function librarySubagentSandbox(pi: ExtensionAPI) {
  const cacheDirectory = libraryOrientationCacheDirectory();
  mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
  registerSubagentSandbox(pi, {
    persistentWritableDirectories: [cacheDirectory],
    xdgCacheHome: path.dirname(path.dirname(cacheDirectory)),
  });
}
