import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Fzf, type FzfResultItem } from "fzf";
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { displayPath } from "./utils.js";

export const MAX_SUGGESTIONS = 30;
const CACHE_TTL_MS = 30_000;
const FD_TIMEOUT_MS = 10_000;
const FD_BASE_ARGS = ["--hidden", "--exclude", ".git", "--exclude", "node_modules", "--exclude", ".next", "--exclude", "dist", "--exclude", "build", "--exclude", "target", "--exclude", ".venv", "--exclude", "vendor", "."];

export type SearchEntry = { absPath: string; display: string; isDirectory: boolean };
export type SearchIndex = { entries: SearchEntry[]; finder: Fzf<SearchEntry[]>; timestamp: number };

type Cache = { cwd: string; index: SearchIndex };

export class SearchSession {
  private cache: Cache | undefined;
  private scan: Promise<void> | undefined;
  private controller: AbortController | undefined;
  private generation = 0;
  private disposed = false;
  private loadErrorShown = false;

  constructor(private readonly pi: ExtensionAPI, private readonly cwd: string, private readonly notify: (message: string) => void) {}

  warm(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.cache && Date.now() - this.cache.index.timestamp < CACHE_TTL_MS) return Promise.resolve();
    if (this.scan) return this.scan;

    const controller = new AbortController();
    const generation = this.generation;
    this.controller = controller;
    this.scan = scanEntries(this.pi, this.cwd, controller.signal)
      .then((entries) => {
        if (this.disposed || generation !== this.generation || controller.signal.aborted) return;
        this.cache = { cwd: this.cwd, index: createIndex(entries) };
        this.loadErrorShown = false;
      })
      .catch((error: unknown) => {
        if (this.disposed || generation !== this.generation || controller.signal.aborted || this.loadErrorShown) return;
        this.loadErrorShown = true;
        this.notify(`fuzzy-files: scan failed: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (this.controller === controller) this.controller = undefined;
        if (generation === this.generation) this.scan = undefined;
      });
    return this.scan;
  }

  getReadyIndex(): SearchIndex | undefined {
    if (this.disposed) return undefined;
    if (!this.cache || this.cache.cwd !== this.cwd) {
      void this.warm();
      return undefined;
    }
    if (Date.now() - this.cache.index.timestamp >= CACHE_TTL_MS) void this.warm();
    return this.cache.index;
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.controller?.abort();
    this.controller = undefined;
  }
}

function createIndex(entries: SearchEntry[]): SearchIndex {
  return {
    entries,
    finder: new Fzf<SearchEntry[]>(entries, { selector: (entry: SearchEntry) => entry.display, fuzzy: "v2", limit: MAX_SUGGESTIONS }),
    timestamp: Date.now(),
  };
}

async function getRoots(cwd: string, signal: AbortSignal): Promise<string[]> {
  const home = homedir();
  const roots = [cwd, resolve(home, ".pi")];
  const projectsDir = resolve(home, "projects");
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    if (signal.aborted) return [];
    for (const entry of entries as Dirent[]) if (entry.isDirectory()) roots.push(resolve(projectsDir, entry.name));
  } catch (error) {
    if (signal.aborted) throw error;
  }
  return [...new Set(roots.map((root) => resolve(root)))];
}

async function scanType(pi: ExtensionAPI, root: string, type: "f" | "d", signal: AbortSignal): Promise<string[]> {
  const result = await pi.exec("fd", ["--type", type, ...FD_BASE_ARGS], { cwd: root, signal, timeout: FD_TIMEOUT_MS });
  if (result.code !== 0 || signal.aborted) return [];
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean).map((rel) => resolve(root, rel));
}

async function scanEntries(pi: ExtensionAPI, cwd: string, signal: AbortSignal): Promise<SearchEntry[]> {
  const roots = await getRoots(cwd, signal);
  const byPath = new Map<string, SearchEntry>();
  for (const root of roots) {
    for (const absPath of await scanType(pi, root, "d", signal)) byPath.set(absPath, { absPath, display: displayPath(absPath, cwd), isDirectory: true });
    for (const absPath of await scanType(pi, root, "f", signal)) {
      if (!byPath.has(absPath)) byPath.set(absPath, { absPath, display: displayPath(absPath, cwd), isDirectory: false });
    }
    if (signal.aborted) return [];
  }
  return [...byPath.values()];
}

export function rankIndex(index: SearchIndex, token: string, maxResults = MAX_SUGGESTIONS): SearchEntry[] {
  if (!token.trim()) return index.entries.slice(0, maxResults);
  return index.finder.find(token.replace(/\s+/g, "")).slice(0, maxResults).map((result: FzfResultItem<SearchEntry>) => result.item);
}

export function rankEntries(entries: SearchEntry[], token: string, maxResults = MAX_SUGGESTIONS): SearchEntry[] {
  return rankIndex(createIndex(entries), token, maxResults);
}
