#!/usr/bin/env tsx
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { argValue } from './lib/args.js';
import { fixtureDirs, readEvalFile, sourceSessionPath } from './lib/fixtures.js';
import { runJudge } from './lib/judge.js';
import { DEFAULT_MODEL, runPiSdk } from './lib/pi.js';
import type { Probe, TokenUsage } from './lib/types.js';

const fixturesRoot = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'suites/om-observer';
const outDir = argValue('--out') ?? `runs/om-observer-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const extensionPath = argValue('--extension') ?? '/tmp/pi-observational-memory';
const model = argValue('--model') ?? DEFAULT_MODEL;
const judgeModel = argValue('--judge-model') ?? model;
const waitMs = Number(argValue('--wait-ms') ?? '10000');
const turns = Number(argValue('--turns') ?? '6');

function addUsage(a: TokenUsage, u?: TokenUsage): TokenUsage {
  return {
    input: (a.input ?? 0) + (u?.input ?? 0),
    output: (a.output ?? 0) + (u?.output ?? 0),
    cacheRead: (a.cacheRead ?? 0) + (u?.cacheRead ?? 0),
    cacheWrite: (a.cacheWrite ?? 0) + (u?.cacheWrite ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (u?.totalTokens ?? 0),
  };
}

function makeOmCwd(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-om-observer-eval-'));
  fs.mkdirSync(path.join(cwd, '.pi'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.pi/settings.json'), JSON.stringify({
    'observational-memory': {
      observeAfterTokens: 1,
      reflectAfterTokens: 1000000,
      compactAfterTokens: 1000000,
      agentMaxTurns: 4,
      model: { provider: model.split('/')[0], id: model.split('/').slice(1).join('/'), thinking: 'off' },
      passive: false,
      debugLog: false,
    },
  }, null, 2));
  return cwd;
}

function normalizeSessionHeader(file: string): void {
  const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  if (entries[0]?.type === 'session') {
    entries[0].version = 3;
    if (typeof entries[0].timestamp !== 'string') entries[0].timestamp = '2026-01-01T00:00:00.000Z';
    entries[0].cwd ??= '/tmp/pi-om-observer-eval';
  }
  fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
}

type Observation = { id: string; content: string; timestamp?: string; relevance?: string; sourceEntryIds?: string[] };

function observationsFromSession(file: string): Observation[] {
  const observations: Observation[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry.type !== 'custom' || entry.customType !== 'om.observations.recorded') continue;
    for (const obs of entry.data?.observations ?? []) observations.push(obs);
  }
  return observations;
}

function renderObservations(observations: Observation[]): string {
  if (observations.length === 0) return 'NO_OBSERVATIONS_RECORDED';
  return observations.map((obs) => `- [${obs.id}] [${obs.relevance ?? 'unknown'}] ${obs.content}\n  sourceEntryIds: ${(obs.sourceEntryIds ?? []).join(', ') || '(none)'}`).join('\n');
}

fs.mkdirSync(outDir, { recursive: true });
const cwd = makeOmCwd();
const results = [];
let passed = 0;
let total = 0;
let usage: TokenUsage = {};

for (const fixtureDir of fixtureDirs(fixturesRoot)) {
  const fixture = path.basename(fixtureDir);
  const evalFile = readEvalFile(fixtureDir) as typeof readEvalFile extends never ? never : ReturnType<typeof readEvalFile> & { observer_probe?: Probe };
  const probe = evalFile.observer_probe;
  if (!probe) throw new Error(`${fixture}: missing observer_probe in eval.yml`);
  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `pi-om-observer-${fixture}-`)), 'session.jsonl');
  fs.copyFileSync(sourceSessionPath(fixtureDir), sessionFile);
  normalizeSessionHeader(sessionFile);

  let prepUsage: TokenUsage = {};
  let stderr = '';
  for (let turn = 1; turn <= turns; turn += 1) {
    const run = await runPiSdk(`Prepare/update observational memory for this synthetic eval session. Observer eval turn ${turn}/${turns}. Reply READY only.`, {
      model,
      sessionFile,
      cwd,
      extensionPaths: [extensionPath],
      waitAfterPromptMs: waitMs,
    });
    prepUsage = addUsage(prepUsage, run.usage);
    stderr += run.stderr;
    if (observationsFromSession(sessionFile).length > 0) break;
  }

  const observations = observationsFromSession(sessionFile);
  const answer = renderObservations(observations);
  const judged = await runJudge(probe, answer, judgeModel);
  usage = addUsage(addUsage(usage, prepUsage), judged.run.usage);
  total += 1;
  if (judged.judge.passed) passed += 1;
  results.push({ fixture, source: sourceSessionPath(fixtureDir), sessionFile, observations, answer, prepUsage, stderr, judge: judged.judge, judgeUsage: judged.run.usage });
  console.log(`${fixture}: ${judged.judge.passed ? 'PASS' : 'FAIL'} (${observations.length} observations)`);
}

const summary = { kind: 'om-observer', fixturesRoot, extensionPath, model, judgeModel, waitMs, turns, passed, total, usage };
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`${outDir}/summary.json`);
console.log(`${passed}/${total} passed, tokens=${usage.totalTokens ?? 0}`);
process.exit(passed === total ? 0 : 1);
