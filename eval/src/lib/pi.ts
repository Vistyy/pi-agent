import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type { TokenUsage } from './types.js';

export const DEFAULT_MODEL = 'openai-codex/gpt-5.4-mini';

function parseModelSpec(spec: string): [provider: string, id: string] {
  const [provider, ...rest] = spec.split('/');
  const id = rest.join('/');
  if (!provider || !id) throw new Error(`model must be provider/id, got: ${spec}`);
  return [provider, id];
}

function addUsage(a: TokenUsage, u?: TokenUsage): TokenUsage {
  if (!u) return a;
  return {
    input: (a.input ?? 0) + (u.input ?? 0),
    output: (a.output ?? 0) + (u.output ?? 0),
    cacheRead: (a.cacheRead ?? 0) + (u.cacheRead ?? 0),
    cacheWrite: (a.cacheWrite ?? 0) + (u.cacheWrite ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (u.totalTokens ?? ((u.input ?? 0) + (u.output ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0))),
  };
}

function sumUsages(usages: TokenUsage[]): TokenUsage | undefined {
  return usages.length ? usages.reduce<TokenUsage>((acc, u) => addUsage(acc, u), {}) : undefined;
}

export type PiRunResult = { stdout: string; stderr: string; status: number; durationMs: number; usage?: TokenUsage; prepUsage?: TokenUsage; answerUsage?: TokenUsage; compactionUsage?: TokenUsage; compaction?: unknown };

type RunPiSdkOptions = {
  model?: string;
  sessionFile?: string;
  cwd?: string;
  systemPrompt?: string;
  extensionPaths?: string[];
  compactBeforePrompt?: boolean;
  compactInstructions?: string;
  compactionSettings?: { keepRecentTokens?: number; reserveTokens?: number };
  allowedTools?: string[];
  prepareMemoryBeforeCompact?: boolean;
  memoryPrepareWaitMs?: number;
  memoryPrepareTurns?: number;
  waitAfterPromptMs?: number;
};

export async function runPiSdk(prompt: string, options: RunPiSdkOptions = {}): Promise<PiRunResult> {
  const started = Date.now();
  let stdout = '';
  let stderr = '';
  let prepUsage: TokenUsage | undefined;
  let answerUsage: TokenUsage | undefined;
  let compactionUsage: TokenUsage | undefined;
  let capturePhase: 'prep' | 'answer' | 'compaction' = 'answer';
  try {
    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);
    const [provider, id] = parseModelSpec(options.model ?? DEFAULT_MODEL);
    const model = modelRegistry.find(provider, id);
    if (!model) throw new Error(`unknown model: ${provider}/${id}`);

    const cwd = options.cwd ?? process.cwd();
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false, ...options.compactionSettings } });
    const agentDir = getAgentDir();
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      additionalExtensionPaths: options.extensionPaths ?? [],
      extensionsOverride: options.extensionPaths?.length ? undefined : (current) => ({ ...current, extensions: [], errors: [] }),
      skillsOverride: () => ({ skills: [], diagnostics: [] }),
      promptsOverride: () => ({ prompts: [], diagnostics: [] }),
      themesOverride: () => ({ themes: [], diagnostics: [] }),
      agentsFilesOverride: () => ({ agentsFiles: [], diagnostics: [] }),
      systemPrompt: options.systemPrompt,
    });
    await loader.reload();

    const { session } = await createAgentSession({
      cwd,
      agentDir,
      model,
      thinkingLevel: 'off',
      authStorage,
      modelRegistry,
      sessionManager: options.sessionFile ? SessionManager.open(options.sessionFile) : SessionManager.inMemory(cwd),
      settingsManager,
      resourceLoader: loader,
      noTools: options.allowedTools?.length ? undefined : 'all',
      tools: options.allowedTools,
    });

    const agentWithStream = (session as unknown as { agent?: { streamFn?: (...args: unknown[]) => Promise<{ result: () => Promise<{ usage?: TokenUsage }> }> } }).agent;
    if (agentWithStream?.streamFn) {
      const originalStreamFn = agentWithStream.streamFn.bind(agentWithStream);
      agentWithStream.streamFn = async (...args: unknown[]) => {
        const stream = await originalStreamFn(...args);
        const originalResult = stream.result.bind(stream);
        stream.result = async () => {
          const result = await originalResult();
          if (capturePhase === 'prep') prepUsage = addUsage(prepUsage ?? {}, result.usage);
          if (capturePhase === 'compaction') compactionUsage = addUsage(compactionUsage ?? {}, result.usage);
          return result;
        };
        return stream;
      };
    }

    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        stdout += event.assistantMessageEvent.delta;
      }
      if (event.type === 'turn_end') {
        const message = (event as unknown as { message?: { usage?: TokenUsage } }).message;
        if (message?.usage && capturePhase === 'answer') answerUsage = addUsage(answerUsage ?? {}, message.usage);
      }
      if (event.type === 'agent_end') {
        const messages = (event as unknown as { messages?: Array<{ usage?: TokenUsage }> }).messages ?? [];
        const usages = messages.map((m) => m.usage).filter((u): u is TokenUsage => Boolean(u));
        if (usages.length) {
          if (capturePhase === 'answer') answerUsage = addUsage(answerUsage ?? {}, sumUsages(usages));
        }
      }
    });
    let compaction: unknown;
    if (options.prepareMemoryBeforeCompact && options.compactBeforePrompt) {
      const turns = Math.max(1, options.memoryPrepareTurns ?? 1);
      for (let turn = 1; turn <= turns; turn += 1) {
        capturePhase = 'prep';
        await session.prompt(`Prepare/update observational memory for this session. Observer eval turn ${turn}/${turns}. Reply READY only.`, { expandPromptTemplates: false });
        stdout = '';
        await new Promise((resolve) => setTimeout(resolve, options.memoryPrepareWaitMs ?? 5000));
      }
    }
    if (options.compactBeforePrompt) {
      capturePhase = 'compaction';
      try {
        compaction = await session.compact(options.compactInstructions);
      } finally {
        capturePhase = 'answer';
      }
    }
    capturePhase = 'answer';
    await session.prompt(prompt, { expandPromptTemplates: false });
    if (options.waitAfterPromptMs) {
      await new Promise((resolve) => setTimeout(resolve, options.waitAfterPromptMs));
    }
    unsubscribe();
    session.dispose();
    const usage = sumUsages([prepUsage, answerUsage, compactionUsage].filter((u): u is TokenUsage => Boolean(u)));
    return { stdout, stderr, status: 0, durationMs: Date.now() - started, usage, prepUsage, answerUsage, compactionUsage, compaction };
  } catch (e) {
    stderr = e instanceof Error ? (e.stack ?? e.message) : String(e);
    return { stdout, stderr, status: 1, durationMs: Date.now() - started };
  }
}

export function isolatedPiArgs(model: string, prompt: string, session?: string): string[] {
  const args = ['--print'];
  if (session) args.push('--session', session);
  else args.push('--no-session');
  args.push(
    '--no-tools', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files',
    '--thinking', 'off', '--model', model, prompt,
  );
  return args;
}
