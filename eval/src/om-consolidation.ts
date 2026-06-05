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
type SourceEntry = { id: string; role: string; text: string; timestamp?: string };
type Input = { sourceEntries: SourceEntry[]; priorObservations?: Observation[]; priorReflections?: Reflection[]; targetTokens?: number; maxTurns?: number; thinkingLevel?: string };

const fixturesRoot = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'suites/om-consolidation';
const outDir = argValue('--out') ?? `runs/om-consolidation-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const extensionPath = argValue('--extension') ?? '/tmp/pi-observational-memory';
const modelSpec = argValue('--model') ?? DEFAULT_MODEL;
const judgeModel = argValue('--judge-model') ?? modelSpec;
const defaultMaxTurns = Number(argValue('--max-turns') ?? '4');
const defaultThinkingLevel = argValue('--thinking') ?? 'off';

function parseModelSpec(spec: string): [string, string] { const [p, ...r] = spec.split('/'); const id = r.join('/'); if (!p || !id) throw new Error(`model must be provider/id, got: ${spec}`); return [p, id]; }
function addUsage(a: TokenUsage, u?: TokenUsage): TokenUsage { return { input:(a.input??0)+(u?.input??0), output:(a.output??0)+(u?.output??0), cacheRead:(a.cacheRead??0)+(u?.cacheRead??0), cacheWrite:(a.cacheWrite??0)+(u?.cacheWrite??0), totalTokens:(a.totalTokens??0)+(u?.totalTokens??0) }; }
function diffUsage(after: TokenUsage, before: TokenUsage): TokenUsage { return { input:(after.input??0)-(before.input??0), output:(after.output??0)-(before.output??0), cacheRead:(after.cacheRead??0)-(before.cacheRead??0), cacheWrite:(after.cacheWrite??0)-(before.cacheWrite??0), totalTokens:(after.totalTokens??0)-(before.totalTokens??0) }; }
function chunk(entries: SourceEntry[]): string { return entries.map(e => `[Source entry id: ${e.id}]\n${e.timestamp ? `[${e.timestamp}] ` : ''}${e.role}: ${e.text}`).join('\n\n'); }
function render(observations?: Observation[], reflections?: Reflection[], dropped?: string[]): string { return `OBSERVATIONS:\n${observations?.map(o=>`- [${o.id}] ${o.content} sourceEntryIds=${o.sourceEntryIds.join(',')}`).join('\n') || '(none)'}\n\nREFLECTIONS:\n${reflections?.map(r=>`- [${r.id}] ${r.content} supportingObservationIds=${r.supportingObservationIds.join(',')}`).join('\n') || '(none)'}\n\nDROPPED_IDS:\n${dropped?.join(', ') || '(none)'}`; }

let omUsage: TokenUsage = {};
const meteredAgentLoop = ((...args: unknown[]) => {
  const stream = (agentLoop as any)(...args);
  const originalResult = stream.result.bind(stream);
  stream.result = async () => {
    const result = await originalResult();
    const messages = Array.isArray(result) ? result : [];
    for (const message of messages) omUsage = addUsage(omUsage, message?.usage);
    omUsage = addUsage(omUsage, result?.usage);
    return result;
  };
  return stream;
});

const agentCoreUrl = pathToFileURL(path.resolve(extensionPath, 'node_modules/@earendil-works/pi-agent-core/dist/index.js')).href;
const { agentLoop } = await import(agentCoreUrl) as { agentLoop: (...args: unknown[]) => any };

const observerUrl = pathToFileURL(path.resolve(extensionPath, 'src/agents/observer/agent.ts')).href;
const reflectorUrl = pathToFileURL(path.resolve(extensionPath, 'src/agents/reflector/agent.ts')).href;
const dropperUrl = pathToFileURL(path.resolve(extensionPath, 'src/agents/dropper/agent.ts')).href;
const { runObserver } = await import(observerUrl) as { runObserver: (args: unknown) => Promise<Observation[] | undefined> };
const { runReflector } = await import(reflectorUrl) as { runReflector: (args: unknown) => Promise<Reflection[] | undefined> };
const { runDropper } = await import(dropperUrl) as { runDropper: (args: unknown) => Promise<string[] | undefined> };
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
let usage = { observer: {} as TokenUsage, reflector: {} as TokenUsage, dropper: {} as TokenUsage, om: {} as TokenUsage, judge: {} as TokenUsage, total: {} as TokenUsage };

for (const fixtureDir of fixtureDirs(fixturesRoot)) {
  const fixture = path.basename(fixtureDir);
  const evalFile = readEvalFile(fixtureDir) as ReturnType<typeof readEvalFile> & { consolidation_input?: Input; consolidation_probe?: Probe };
  if (!evalFile.consolidation_input) throw new Error(`${fixture}: missing consolidation_input`);
  if (!evalFile.consolidation_probe) throw new Error(`${fixture}: missing consolidation_probe`);
  const input = evalFile.consolidation_input;
  const beforeObserver = omUsage;
  const observations = await runObserver({ model, apiKey: auth.apiKey, headers: auth.headers, priorReflections: [], priorObservations: [], chunk: chunk(input.sourceEntries), allowedSourceEntryIds: input.sourceEntries.map(e=>e.id), agentLoop: meteredAgentLoop, maxTurns: input.maxTurns ?? defaultMaxTurns, thinkingLevel: input.thinkingLevel ?? defaultThinkingLevel });
  const observerUsage = diffUsage(omUsage, beforeObserver);
  const allObservations = [...(input.priorObservations ?? []), ...(observations ?? [])];
  const beforeReflector = omUsage;
  const reflections = await runReflector({ model, apiKey: auth.apiKey, headers: auth.headers, reflections: input.priorReflections ?? [], observations: allObservations, agentLoop: meteredAgentLoop, maxTurns: input.maxTurns ?? defaultMaxTurns, thinkingLevel: input.thinkingLevel ?? defaultThinkingLevel });
  const reflectorUsage = diffUsage(omUsage, beforeReflector);
  const allReflections = [...(input.priorReflections ?? []), ...(reflections ?? [])];
  const beforeDropper = omUsage;
  const dropped = input.targetTokens ? await runDropper({ model, apiKey: auth.apiKey, headers: auth.headers, reflections: allReflections, observations: allObservations, targetTokens: input.targetTokens, agentLoop: meteredAgentLoop, maxTurns: input.maxTurns ?? defaultMaxTurns, thinkingLevel: input.thinkingLevel ?? defaultThinkingLevel }) : undefined;
  const dropperUsage = diffUsage(omUsage, beforeDropper);
  const caseOmUsage = addUsage(addUsage(observerUsage, reflectorUsage), dropperUsage);
  const answer = render(observations, reflections, dropped);
  const judged = await runJudge(evalFile.consolidation_probe, answer, judgeModel);
  usage.observer = addUsage(usage.observer, observerUsage); usage.reflector = addUsage(usage.reflector, reflectorUsage); usage.dropper = addUsage(usage.dropper, dropperUsage); usage.om = addUsage(usage.om, caseOmUsage); usage.judge = addUsage(usage.judge, judged.run.usage); usage.total = addUsage(addUsage({}, usage.om), usage.judge);
  total++; if (judged.judge.passed) passed++;
  results.push({ fixture, observations: observations ?? [], reflections: reflections ?? [], droppedIds: dropped ?? [], answer, judge: judged.judge, usage: { observer: observerUsage, reflector: reflectorUsage, dropper: dropperUsage, om: caseOmUsage, judge: judged.run.usage } });
  console.log(`${fixture}: ${judged.judge.passed ? 'PASS' : 'FAIL'} observer=${observerUsage.totalTokens ?? 0} reflector=${reflectorUsage.totalTokens ?? 0} dropper=${dropperUsage.totalTokens ?? 0}`);
}
const summary = { kind: 'om-consolidation', fixturesRoot, extensionPath, model: modelSpec, judgeModel, maxTurns: defaultMaxTurns, thinkingLevel: defaultThinkingLevel, passed, total, usage };
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`${outDir}/summary.json`); console.log(`${passed}/${total} passed, omTokens=${usage.om.totalTokens ?? 0}, judgeTokens=${usage.judge.totalTokens ?? 0}, total=${usage.total.totalTokens ?? 0}`);
process.exit(passed === total ? 0 : 1);
