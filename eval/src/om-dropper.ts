#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AuthStorage, ModelRegistry } from '@earendil-works/pi-coding-agent';
import { argValue } from './lib/args.js';
import { fixtureDirs, readEvalFile } from './lib/fixtures.js';
import { runJudge } from './lib/judge.js';
import { DEFAULT_MODEL } from './lib/pi.js';
import type { Probe, TokenUsage } from './lib/types.js';

type Observation = { id: string; content: string; timestamp: string; relevance: 'low'|'medium'|'high'|'critical'; sourceEntryIds: string[]; tokenCount: number };
type Reflection = { id: string; content: string; supportingObservationIds: string[]; tokenCount: number };
type DropperInput = { observations: Observation[]; reflections?: Reflection[]; targetTokens: number; maxTurns?: number; thinkingLevel?: string };

const fixturesRoot = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'suites/om-dropper';
const outDir = argValue('--out') ?? `runs/om-dropper-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const extensionPath = argValue('--extension') ?? '/tmp/pi-observational-memory';
const modelSpec = argValue('--model') ?? DEFAULT_MODEL;
const judgeModel = argValue('--judge-model') ?? modelSpec;
const maxTurns = Number(argValue('--max-turns') ?? '4');
const thinkingLevel = argValue('--thinking') ?? 'off';

function parseModelSpec(spec: string): [string, string] {
  const [provider, ...rest] = spec.split('/');
  const id = rest.join('/');
  if (!provider || !id) throw new Error(`model must be provider/id, got: ${spec}`);
  return [provider, id];
}
function addUsage(a: TokenUsage, u?: TokenUsage): TokenUsage {
  return { input: (a.input ?? 0) + (u?.input ?? 0), output: (a.output ?? 0) + (u?.output ?? 0), cacheRead: (a.cacheRead ?? 0) + (u?.cacheRead ?? 0), cacheWrite: (a.cacheWrite ?? 0) + (u?.cacheWrite ?? 0), totalTokens: (a.totalTokens ?? 0) + (u?.totalTokens ?? 0) };
}
function renderDropped(ids: string[] | undefined): string { return ids?.length ? `DROPPED_IDS: ${ids.join(', ')}` : 'NO_DROPS'; }

const moduleUrl = pathToFileURL(path.resolve(extensionPath, 'src/agents/dropper/agent.ts')).href;
const { runDropper } = await import(moduleUrl) as { runDropper: (args: unknown) => Promise<string[] | undefined> };
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const [provider, id] = parseModelSpec(modelSpec);
const model = modelRegistry.find(provider, id);
if (!model) throw new Error(`unknown model: ${modelSpec}`);
const auth = await modelRegistry.getApiKeyAndHeaders(model);
if (!auth.ok || !auth.apiKey) throw new Error(`no API key for ${provider}`);

fs.mkdirSync(outDir, { recursive: true });
const results = [];
let passed = 0, total = 0;
let usage: TokenUsage = {};

for (const fixtureDir of fixtureDirs(fixturesRoot)) {
  const fixture = path.basename(fixtureDir);
  const evalFile = readEvalFile(fixtureDir) as ReturnType<typeof readEvalFile> & { dropper_input?: DropperInput; dropper_probe?: Probe };
  if (!evalFile.dropper_input) throw new Error(`${fixture}: missing dropper_input`);
  if (!evalFile.dropper_probe) throw new Error(`${fixture}: missing dropper_probe`);
  const dropped = await runDropper({
    model,
    apiKey: auth.apiKey,
    headers: auth.headers,
    observations: evalFile.dropper_input.observations,
    reflections: evalFile.dropper_input.reflections ?? [],
    targetTokens: evalFile.dropper_input.targetTokens,
    maxTurns: evalFile.dropper_input.maxTurns ?? maxTurns,
    thinkingLevel: evalFile.dropper_input.thinkingLevel ?? thinkingLevel,
  });
  const answer = renderDropped(dropped);
  const judged = await runJudge(evalFile.dropper_probe, answer, judgeModel);
  usage = addUsage(usage, judged.run.usage);
  total++; if (judged.judge.passed) passed++;
  results.push({ fixture, input: evalFile.dropper_input, droppedIds: dropped ?? [], answer, judge: judged.judge, judgeUsage: judged.run.usage });
  console.log(`${fixture}: ${judged.judge.passed ? 'PASS' : 'FAIL'} (${dropped?.length ?? 0} drops)`);
}
const summary = { kind: 'om-dropper', fixturesRoot, extensionPath, model: modelSpec, judgeModel, maxTurns, thinkingLevel, passed, total, usage };
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`${outDir}/summary.json`);
console.log(`${passed}/${total} passed, judgeTokens=${usage.totalTokens ?? 0}`);
process.exit(passed === total ? 0 : 1);
