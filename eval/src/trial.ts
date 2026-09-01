import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  createAgentSession,
  DefaultResourceLoader,
  getPackageDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

import type { Catalog, CatalogCase, ConfiguredSystem, Evidence, RuntimeBinding, TrialArtifact, TrialError } from "./types.js";

const execFileAsync = promisify(execFile);

interface TrialOptions {
  catalog: Catalog;
  catalogCase: CatalogCase;
  system: ConfiguredSystem;
  runId: string;
  trialIndex: number;
  timeoutMs: number;
}

interface TrajectoryEntry {
  type: "tool_execution_start" | "tool_execution_end";
  interaction_turn: number;
  tool_call_id: string;
  tool_name: string;
  args?: unknown;
  result?: unknown;
  is_error?: boolean;
}

function jsonValue(value: unknown): unknown {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? null : JSON.parse(encoded);
}

export function visibleTranscript(messages: readonly unknown[]): Array<{ role: "user" | "assistant"; text: string }> {
  const transcript: Array<{ role: "user" | "assistant"; text: string }> = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || !("role" in message) || !("content" in message)) continue;
    const role = (message as { role?: unknown }).role;
    if (role !== "user" && role !== "assistant") continue;
    const content = (message as { content?: unknown }).content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((item): item is { type: "text"; text: string } =>
              Boolean(item && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string"),
            )
            .map((item) => item.text)
            .join("\n")
        : "";
    if (text.trim().length > 0) transcript.push({ role, text });
  }
  return transcript;
}

function errorRecord(stage: TrialError["stage"], error: unknown): TrialError {
  return {
    stage,
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
  };
}

async function packageVersion(packageFile: string): Promise<string> {
  const value = JSON.parse(await readFile(packageFile, "utf8")) as { version?: unknown };
  if (typeof value.version !== "string" || value.version.length === 0) throw new Error(`Package has no version: ${packageFile}`);
  return value.version;
}

async function repositoryState(root: string): Promise<{ commit: string | null; dirty: boolean | null }> {
  try {
    const [{ stdout: commit }, { stdout: statusOutput }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root }),
      execFileAsync("git", ["status", "--porcelain"], { cwd: root }),
    ]);
    return { commit: commit.trim(), dirty: statusOutput.trim().length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

async function prepareFixture(catalogCase: CatalogCase): Promise<{ cwd: string; cleanup: () => Promise<void> }> {
  const source = path.resolve(catalogCase.directory, catalogCase.binding.fixture.source);
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-behavior-eval-"));
  const cwd = path.join(root, "project");
  await cp(source, cwd, { recursive: true });
  return { cwd, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export async function verifyPreflight(cwd: string, checks: RuntimeBinding["preflight"]): Promise<void> {
  const fixtureRoot = path.resolve(cwd);
  for (const [conditionId, check] of Object.entries(checks)) {
    if (check.checker !== "files-contain") throw new Error(`Unknown preflight check "${check.checker}" for "${conditionId}"`);
    for (const fileCheck of check.files) {
      const file = path.resolve(fixtureRoot, fileCheck.path);
      if (file !== fixtureRoot && !file.startsWith(`${fixtureRoot}${path.sep}`)) {
        throw new Error(`Initial condition "${conditionId}" references a file outside the fixture: ${fileCheck.path}`);
      }
      const content = await readFile(file, "utf8").catch((error: unknown) => {
        throw new Error(`Initial condition "${conditionId}" could not read ${fileCheck.path}: ${error instanceof Error ? error.message : String(error)}`);
      });
      for (const expected of fileCheck.contains) {
        if (!content.includes(expected)) {
          throw new Error(`Initial condition "${conditionId}" failed: ${fileCheck.path} does not contain ${JSON.stringify(expected)}`);
        }
      }
    }
  }
}

async function existingPaths(root: string, values: string[], label: string): Promise<string[]> {
  const paths = values.map((value) => path.resolve(root, value));
  for (const value of paths) {
    if (!(await stat(value).catch(() => undefined))) throw new Error(`${label} path does not exist: ${value}`);
  }
  return paths;
}

async function createSession(
  catalog: Catalog,
  system: ConfiguredSystem,
  cwd: string,
): Promise<{ session: AgentSession; dispose: () => void }> {
  const repositoryRoot = path.dirname(catalog.root);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 1 },
  });
  const extensionPaths = await existingPaths(repositoryRoot, system.resources.extensions, "Extension");
  const skillPaths = await existingPaths(repositoryRoot, system.resources.skills, "Skill");
  const contextPaths = await existingPaths(repositoryRoot, system.resources.context_files, "Context");
  const contextFiles = await Promise.all(
    contextPaths.map(async (file) => ({ path: file, content: await readFile(file, "utf8") })),
  );

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: repositoryRoot,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    additionalExtensionPaths: extensionPaths,
    additionalSkillPaths: skillPaths,
    agentsFilesOverride: () => ({ agentsFiles: contextFiles }),
  });
  await resourceLoader.reload();

  const diagnostics = [
    ...resourceLoader.getSkills().diagnostics,
    ...resourceLoader.getPrompts().diagnostics,
    ...resourceLoader.getThemes().diagnostics,
  ].filter((diagnostic) => diagnostic.type === "error");
  const extensionErrors = resourceLoader.getExtensions().errors;
  if (diagnostics.length > 0 || extensionErrors.length > 0) {
    throw new Error(`Resource loading failed: ${JSON.stringify({ diagnostics, extensionErrors })}`);
  }

  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(repositoryRoot, "auth.json"),
    modelsPath: path.join(repositoryRoot, "models.json"),
    modelsStorePath: path.join(repositoryRoot, "models-store.json"),
  });
  const model = modelRuntime.getModel(system.model.provider, system.model.id);
  if (!model) throw new Error(`Model not found: ${system.model.provider}/${system.model.id}`);

  const { session } = await createAgentSession({
    cwd,
    agentDir: repositoryRoot,
    model,
    thinkingLevel: system.model.thinking_level,
    modelRuntime,
    tools: system.tools,
    resourceLoader,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
  });
  return { session, dispose: () => session.dispose() };
}

async function promptWithTimeout(session: AgentSession, prompt: string, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const promptResult = session.prompt(prompt);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Trial prompt exceeded ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    await Promise.race([promptResult, timeout]);
  } catch (error) {
    await session.abort().catch(() => undefined);
    await promptResult.catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function collectUsage(messages: readonly unknown[]): TrialArtifact["usage"] {
  const total = { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0, total: 0, cost_total: 0 };
  for (const message of messages) {
    if (!message || typeof message !== "object" || !("usage" in message)) continue;
    const usage = (message as { usage?: Record<string, unknown> }).usage;
    if (!usage) continue;
    const input = typeof usage.input === "number" ? usage.input : 0;
    const output = typeof usage.output === "number" ? usage.output : 0;
    const reasoning = typeof usage.reasoning === "number" ? usage.reasoning : 0;
    const cacheRead = typeof usage.cacheRead === "number" ? usage.cacheRead : 0;
    const cacheWrite = typeof usage.cacheWrite === "number" ? usage.cacheWrite : 0;
    const cost = usage.cost && typeof usage.cost === "object" && typeof (usage.cost as { total?: unknown }).total === "number"
      ? (usage.cost as { total: number }).total
      : 0;
    total.input += input;
    total.output += output;
    total.reasoning += reasoning;
    total.cache_read += cacheRead;
    total.cache_write += cacheWrite;
    total.total += typeof usage.totalTokens === "number" ? usage.totalTokens : input + output + cacheRead + cacheWrite;
    total.cost_total += cost;
  }
  return total;
}

export async function runTrial(options: TrialOptions): Promise<TrialArtifact> {
  const started = Date.now();
  const errors: TrialError[] = [];
  const evidence: Evidence[] = [];
  const trajectory: TrajectoryEntry[] = [];
  let fixture: Awaited<ReturnType<typeof prepareFixture>> | undefined;
  let sessionHandle: Awaited<ReturnType<typeof createSession>> | undefined;
  let cleanup: TrialArtifact["cleanup"] = { status: "pass" };
  let messages: unknown[] = [];

  try {
    try {
      fixture = await prepareFixture(options.catalogCase);
    } catch (error) {
      errors.push(errorRecord("fixture", error));
    }

    if (fixture) {
      try {
        await verifyPreflight(fixture.cwd, options.catalogCase.binding.preflight);
      } catch (error) {
        errors.push(errorRecord("preflight", error));
      }
    }

    if (fixture && errors.length === 0) {
      try {
        sessionHandle = await createSession(options.catalog, options.system, fixture.cwd);
      } catch (error) {
        errors.push(errorRecord("session", error));
      }
    }

    if (sessionHandle && errors.length === 0) {
      let interactionTurn = 0;
      const unsubscribe = sessionHandle.session.subscribe((event: AgentSessionEvent) => {
        if (event.type === "tool_execution_start") {
          trajectory.push({
            type: event.type,
            interaction_turn: interactionTurn,
            tool_call_id: event.toolCallId,
            tool_name: event.toolName,
            args: jsonValue(event.args),
          });
        } else if (event.type === "tool_execution_end") {
          trajectory.push({
            type: event.type,
            interaction_turn: interactionTurn,
            tool_call_id: event.toolCallId,
            tool_name: event.toolName,
            result: jsonValue(event.result),
            is_error: event.isError,
          });
        }
      });
      try {
        for (const [index, message] of options.catalogCase.spec.scenario.interaction.messages.entries()) {
          interactionTurn = index + 1;
          await promptWithTimeout(sessionHandle.session, message.content, options.timeoutMs);
        }
        messages = jsonValue(sessionHandle.session.messages) as unknown[];
      } catch (error) {
        errors.push(errorRecord("driver", error));
        messages = jsonValue(sessionHandle.session.messages) as unknown[];
      } finally {
        unsubscribe();
      }
    }

    for (const observation of options.catalogCase.spec.observations) {
      const collector = options.catalogCase.binding.collectors[observation.id];
      if (collector === "pi-message-collector") {
        const transcript = visibleTranscript(messages);
        if (transcript.length > 0) evidence.push({ id: observation.id, boundary: observation.boundary, value: transcript });
      } else if (collector === "pi-tool-trajectory-collector") {
        evidence.push({ id: observation.id, boundary: observation.boundary, value: trajectory });
      } else {
        errors.push(errorRecord("evidence", new Error(`Unsupported collector: ${collector}`)));
      }
    }

    const requiredEvidence = new Set(options.catalogCase.spec.observations.map((observation) => observation.id));
    for (const observationId of requiredEvidence) {
      if (!evidence.some((item) => item.id === observationId)) {
        errors.push(errorRecord("evidence", new Error(`Required evidence was not captured: ${observationId}`)));
      }
    }
  } finally {
    if (sessionHandle) {
      try {
        sessionHandle.dispose();
      } catch (error) {
        errors.push(errorRecord("session", error));
      }
    }
    if (fixture) {
      try {
        await fixture.cleanup();
      } catch (error) {
        cleanup = { status: "fail", message: error instanceof Error ? error.message : String(error) };
        errors.push(errorRecord("cleanup", error));
      }
    }
  }

  const [harnessVersion, piVersion] = await Promise.all([
    packageVersion(path.join(options.catalog.root, "package.json")),
    packageVersion(path.join(getPackageDir(), "package.json")),
  ]);

  return {
    schema_version: 2,
    identity: {
      run_id: options.runId,
      case_id: options.catalogCase.spec.id,
      system_id: options.system.id,
      trial_index: options.trialIndex,
    },
    configuration: {
      model: options.system.model,
      resources: options.system.resources,
      tools: options.system.tools,
      harness_version: harnessVersion,
      pi_version: piVersion,
      repository: await repositoryState(path.dirname(options.catalog.root)),
    },
    validity: errors.length === 0 ? "valid" : "invalid",
    behavior: "unknown",
    evidence,
    grades: options.catalogCase.spec.criteria.map((criterion) => ({
      criterion_id: criterion.id,
      behavior: "unknown",
      grader: "pending_human",
      reason: "Automatic semantic grading is intentionally outside the walking skeleton.",
    })),
    cleanup,
    usage: collectUsage(messages),
    duration_ms: Date.now() - started,
    errors,
  };
}
