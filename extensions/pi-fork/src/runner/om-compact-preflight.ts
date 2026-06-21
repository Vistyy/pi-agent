import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type CompactionResult,
  type ExtensionRunner,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";

const OM_FOLDED = "om.folded";
const OM_COMPACT_ERROR = "Cannot fork with sessionSnapshot=\"om-compact\": observational memory did not provide compaction.";

type CompactionSettings = ReturnType<SettingsManager["getCompactionSettings"]>;
type CompactionPreparation = unknown;
type PrepareCompaction = (entries: SessionEntry[], settings: CompactionSettings) => CompactionPreparation | undefined;

type SessionForOmCompaction = Pick<SessionManager, "appendCompaction" | "getBranch" | "getEntry">;
type SettingsForOmCompaction = Pick<SettingsManager, "getCompactionSettings">;
type ExtensionRunnerForOmCompaction = Pick<ExtensionRunner, "emit" | "hasHandlers">;

interface OmCompactionRuntime {
  sessionManager: SessionForOmCompaction;
  settingsManager: SettingsForOmCompaction;
  extensionRunner: ExtensionRunnerForOmCompaction;
}

interface ApplyOmCompactionOptions {
  signal?: AbortSignal;
  prepareCompaction?: PrepareCompaction;
}

interface CompactForkSessionWithOmOptions {
  cwd: string;
  sessionPath: string;
  signal?: AbortSignal;
  omExtensionPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOmCompaction(value: unknown): value is CompactionResult {
  return (
    isRecord(value) &&
    typeof value.summary === "string" &&
    typeof value.firstKeptEntryId === "string" &&
    typeof value.tokensBefore === "number" &&
    isRecord(value.details) &&
    value.details.type === OM_FOLDED
  );
}

function getPiCodingAgentPackageDir(): string {
  const indexPath = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  return path.dirname(path.dirname(indexPath));
}

async function loadPrepareCompaction(): Promise<PrepareCompaction> {
  const modulePath = pathToFileURL(path.join(getPiCodingAgentPackageDir(), "dist/core/compaction/compaction.js")).href;
  const mod = await import(modulePath) as { prepareCompaction?: unknown };
  if (typeof mod.prepareCompaction !== "function") {
    throw new Error("Cannot fork with sessionSnapshot=\"om-compact\": Pi compaction preparation API is unavailable.");
  }
  return mod.prepareCompaction as PrepareCompaction;
}

function getExtensionRunner(session: AgentSession): ExtensionRunnerForOmCompaction {
  const runner = (session as unknown as { _extensionRunner?: ExtensionRunnerForOmCompaction })._extensionRunner;
  if (!runner) {
    throw new Error("Cannot fork with sessionSnapshot=\"om-compact\": Pi extension runtime is unavailable.");
  }
  return runner;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("OM compact fork preflight was aborted.");
}

export async function applyOmCompactionToSession(
  runtime: OmCompactionRuntime,
  options: ApplyOmCompactionOptions = {},
): Promise<void> {
  const prepareCompaction = options.prepareCompaction ?? await loadPrepareCompaction();
  const branchEntries = runtime.sessionManager.getBranch();
  const preparation = prepareCompaction(branchEntries, runtime.settingsManager.getCompactionSettings());
  if (!preparation) {
    throw new Error("Cannot fork with sessionSnapshot=\"om-compact\": nothing to compact.");
  }

  assertNotAborted(options.signal);
  if (!runtime.extensionRunner.hasHandlers("session_before_compact")) {
    throw new Error(OM_COMPACT_ERROR);
  }

  const result = await runtime.extensionRunner.emit({
    type: "session_before_compact",
    preparation,
    branchEntries,
    signal: options.signal,
  } as any) as any;

  assertNotAborted(options.signal);
  if (result?.cancel) throw new Error("OM compact fork preflight was cancelled.");
  if (!isOmCompaction(result?.compaction)) throw new Error(OM_COMPACT_ERROR);

  const compaction = result.compaction;
  const compactionEntryId = runtime.sessionManager.appendCompaction(
    compaction.summary,
    compaction.firstKeptEntryId,
    compaction.tokensBefore,
    compaction.details,
    true,
  );
  const compactionEntry = runtime.sessionManager.getEntry(compactionEntryId);
  if (compactionEntry) {
    await runtime.extensionRunner.emit({
      type: "session_compact",
      compactionEntry,
      fromExtension: true,
    } as any);
  }
}

export async function compactForkSessionWithOm(options: CompactForkSessionWithOmOptions): Promise<void> {
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(options.cwd, agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: [options.omExtensionPath],
  });
  await resourceLoader.reload();

  const sessionManager = SessionManager.open(options.sessionPath, undefined, options.cwd);
  const { session } = await createAgentSession({
    cwd: options.cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    sessionManager,
    noTools: "all",
    sessionStartEvent: { type: "session_start", reason: "startup" },
  });

  try {
    await applyOmCompactionToSession({
      sessionManager,
      settingsManager,
      extensionRunner: getExtensionRunner(session),
    }, { signal: options.signal });
  } finally {
    session.dispose();
  }
}
