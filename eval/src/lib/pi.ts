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

export type PiRunResult = { stdout: string; stderr: string; status: number; durationMs: number; usage?: TokenUsage };

export async function runPiSdk(prompt: string, options: { model?: string; sessionFile?: string; cwd?: string } = {}): Promise<PiRunResult> {
  const started = Date.now();
  let stdout = '';
  let stderr = '';
  let usage: TokenUsage | undefined;
  try {
    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);
    const [provider, id] = parseModelSpec(options.model ?? DEFAULT_MODEL);
    const model = modelRegistry.find(provider, id);
    if (!model) throw new Error(`unknown model: ${provider}/${id}`);

    const cwd = options.cwd ?? process.cwd();
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
    const agentDir = getAgentDir();
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      extensionsOverride: (current) => ({ ...current, extensions: [], errors: [] }),
      skillsOverride: () => ({ skills: [], diagnostics: [] }),
      promptsOverride: () => ({ prompts: [], diagnostics: [] }),
      themesOverride: () => ({ themes: [], diagnostics: [] }),
      agentsFilesOverride: () => ({ agentsFiles: [], diagnostics: [] }),
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
      noTools: 'all',
    });

    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        stdout += event.assistantMessageEvent.delta;
      }
      if (event.type === 'turn_end') {
        const message = (event as unknown as { message?: { usage?: TokenUsage } }).message;
        if (message?.usage) usage = message.usage;
      }
      if (event.type === 'agent_end') {
        const messages = (event as unknown as { messages?: Array<{ usage?: TokenUsage }> }).messages ?? [];
        const lastWithUsage = [...messages].reverse().find((m) => m.usage);
        if (lastWithUsage?.usage) usage = lastWithUsage.usage;
      }
    });
    await session.prompt(prompt, { expandPromptTemplates: false });
    unsubscribe();
    session.dispose();
    return { stdout, stderr, status: 0, durationMs: Date.now() - started, usage };
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
