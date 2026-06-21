export type ForkSessionSnapshotMode = "full" | "om-compact";

export interface ForkSessionSnapshotConfig {
  mode: ForkSessionSnapshotMode;
  recentTailEntryCount: number;
}

export interface SessionSnapshotSource {
  getHeader: () => unknown;
  getBranch: () => unknown[];
}

type SessionEntry = {
  type?: unknown;
  id?: unknown;
  parentId?: unknown;
  timestamp?: unknown;
  customType?: unknown;
  data?: unknown;
};

type Reflection = {
  id: string;
  content: string;
  sources: string[];
  createdAt?: string;
};

const OM_REFLECTIONS_RECORDED = "om.reflections.recorded";
const OM_REFLECTIONS_REWRITTEN = "om.reflections.rewritten";
const OM_FOLDED = "om.folded";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function entryId(entry: unknown): string | undefined {
  return isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined;
}

function entryTimestamp(entry: unknown): string {
  return isRecord(entry) && typeof entry.timestamp === "string" ? entry.timestamp : new Date().toISOString();
}

function normalizeReflection(value: unknown): Reflection | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.content !== "string" || !Array.isArray(value.sources)) return undefined;
  const sources = value.sources.filter((source): source is string => typeof source === "string");
  return {
    id: value.id,
    content: value.content,
    sources,
    ...(typeof value.createdAt === "string" ? { createdAt: value.createdAt } : {}),
  };
}

function recordedReflections(entry: SessionEntry): Reflection[] {
  if (entry.type !== "custom" || entry.customType !== OM_REFLECTIONS_RECORDED || !isRecord(entry.data) || !Array.isArray(entry.data.reflections)) return [];
  return entry.data.reflections.map(normalizeReflection).filter((reflection): reflection is Reflection => !!reflection);
}

function retiredReflectionIds(entry: SessionEntry): string[] {
  if (entry.type !== "custom" || entry.customType !== OM_REFLECTIONS_REWRITTEN || !isRecord(entry.data) || !Array.isArray(entry.data.retiredReflectionIds)) return [];
  return entry.data.retiredReflectionIds.filter((id): id is string => typeof id === "string");
}

export function activeOmReflections(entries: unknown[]): Reflection[] {
  const reflections = new Map<string, Reflection>();
  const retired = new Set<string>();
  for (const entry of entries as SessionEntry[]) {
    for (const reflection of recordedReflections(entry)) {
      reflections.set(reflection.id, reflection);
    }
    for (const id of retiredReflectionIds(entry)) {
      retired.add(id);
    }
  }
  return Array.from(reflections.values()).filter((reflection) => !retired.has(reflection.id));
}

function renderOmCompactSummary(reflections: Reflection[]): string {
  if (reflections.length === 0) return "Observational memory: no active reflections.";
  return [
    "Observational memory compact snapshot.",
    "Active reflections:",
    ...reflections.map((reflection) => `[${reflection.id}] ${reflection.content}`),
  ].join("\n");
}

function buildOmCompactionEntry(entries: unknown[], reflections: Reflection[]): Record<string, unknown> {
  const lastEntry = entries.at(-1);
  const lastId = entryId(lastEntry);
  return {
    type: "compaction",
    id: `fork-om-compact-${Date.now()}`,
    parentId: null,
    timestamp: entryTimestamp(lastEntry),
    firstKeptEntryId: lastId,
    summary: renderOmCompactSummary(reflections),
    details: {
      type: OM_FOLDED,
      reflections,
    },
  };
}

function buildFullSnapshot(header: unknown, entries: unknown[]): string {
  return `${[header, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function buildOmCompactSnapshot(header: unknown, entries: unknown[], recentTailEntryCount: number): string {
  const tailCount = Math.max(0, Math.floor(recentTailEntryCount));
  const tail = tailCount === 0 ? [] : entries.slice(-tailCount);
  const tailIds = new Set(tail.map(entryId).filter((id): id is string => !!id));
  const prefix = tailIds.size === 0 ? entries : entries.filter((entry) => {
    const id = entryId(entry);
    return !id || !tailIds.has(id);
  });
  const reflections = activeOmReflections(prefix.length > 0 ? prefix : entries);
  return buildFullSnapshot(header, [buildOmCompactionEntry(entries, reflections), ...tail]);
}

export function buildForkSessionSnapshotJsonl(
  sessionManager: SessionSnapshotSource,
  config: ForkSessionSnapshotConfig = { mode: "full", recentTailEntryCount: 20 },
): string | null {
  const header = sessionManager.getHeader();
  if (!header || typeof header !== "object") return null;

  const branchEntries = sessionManager.getBranch();
  if (config.mode === "om-compact") return buildOmCompactSnapshot(header, branchEntries, config.recentTailEntryCount);
  return buildFullSnapshot(header, branchEntries);
}
