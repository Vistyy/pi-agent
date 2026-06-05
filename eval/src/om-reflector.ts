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

type Observation = { id: string; content: string; timestamp: string; relevance: string; sourceEntryIds: string[]; tokenCount: number };
type Reflection = { id: string; content: string; supportingObservationIds: string[]; tokenCount: number };
type ReflectorInput = { observations: Observation[]; reflections?: Reflection[]; maxTurns?: number; thinkingLevel?: string };

const fixturesRoot = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'suites/om-reflector';
const outDir = argValue('--out') ?? `runs/om-reflector-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const extensionPath = argValue('--extension') ?? '/tmp/pi-observational-memory';
const modelSpec = argValue('--model') ?? DEFAULT_MODEL;
const judgeModel = argValue('--judge-model') ?? modelSpec;
const maxTurns = Number(argValue('--max-turns') ?? '4');
const thinkingLevel = argValue('--thinking') ?? 'off';

function parseModelSpec(spec: string): [provider: string, id: string] {
  const [provider, ...rest] = spec.split('/');
  const id = rest.join('/');
  if (!provider || !id) throw new Error(`model must be provider/id, got: ${spec}`);
  return [provider, id];
}

function addUsage(a: TokenUsage, u?: TokenUsage): TokenUsage {
  return {
    input: (a.input ?? 0) + (u?.input ?? 0),
    output: (a.output ?? 0) + (u?.output ?? 0),
    cacheRead: (a.cacheRead ?? 0) + (u?.cacheRead ?? 0),
    cacheWrite: (a.cacheWrite ?? 0) + (u?.cacheWrite ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (u?.totalTokens ?? 0),
  };
}

function renderReflections(reflections: Reflection[] | undefined): string {
  if (!reflections?.length) return 'NO_REFLECTIONS_RECORDED';
  return reflections.map((r) => `- [${r.id}] ${r.content}\n  supportingObservationIds: ${r.supportingObservationIds.join(', ') || '(none)'}`).join('\n');
}

const moduleUrl = pathToFileURL(path.resolve(extensionPath, 'src/agents/reflector/agent.ts')).href;
const { runReflector } = await import(moduleUrl) as { runReflector: (args: unknown) => Promise<Reflection[] | undefined> };
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const [provider, id] = parseModelSpec(modelSpec);
const model = modelRegistry.find(provider, id);
if (!model) throw new Error(`unknown model: ${modelSpec}`);
const auth = await modelRegistry.getApiKeyAndHeaders(model);
if (!auth.ok || !auth.apiKey) throw new Error(`no API key for ${provider}`);

fs.mkdirSync(outDir, { recursive: true });
const results = [];
let passed = 0;
let total = 0;
let usage: TokenUsage = {};

for (const fixtureDir of fixtureDirs(fixturesRoot)) {
  const fixture = path.basename(fixtureDir);
  const evalFile = readEvalFile(fixtureDir) as ReturnType<typeof readEvalFile> & { reflector_input?: ReflectorInput; reflector_probe?: Probe };
  if (!evalFile.reflector_input) throw new Error(`${fixture}: missing reflector_input`);
  if (!evalFile.reflector_probe) throw new Error(`${fixture}: missing reflector_probe`);
  const reflections = await runReflector({
    model,
    apiKey: auth.apiKey,
    headers: auth.headers,
    observations: evalFile.reflector_input.observations,
    reflections: evalFile.reflector_input.reflections ?? [],
    maxTurns: evalFile.reflector_input.maxTurns ?? maxTurns,
    thinkingLevel: evalFile.reflector_input.thinkingLevel ?? thinkingLevel,
  });
  const answer = renderReflections(reflections);
  const judged = await runJudge(evalFile.reflector_probe, answer, judgeModel);
  usage = addUsage(usage, judged.run.usage);
  total += 1;
  if (judged.judge.passed) passed += 1;
  results.push({ fixture, input: evalFile.reflector_input, reflections: reflections ?? [], answer, judge: judged.judge, judgeUsage: judged.run.usage });
  console.log(`${fixture}: ${judged.judge.passed ? 'PASS' : 'FAIL'} (${reflections?.length ?? 0} reflections)`);
}

const summary = { kind: 'om-reflector', fixturesRoot, extensionPath, model: modelSpec, judgeModel, maxTurns, thinkingLevel, passed, total, usage };
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`${outDir}/summary.json`);
console.log(`${passed}/${total} passed, judgeTokens=${usage.totalTokens ?? 0}`);
process.exit(passed === total ? 0 : 1);
