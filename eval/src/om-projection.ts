#!/usr/bin/env tsx
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { argValue } from './lib/args.js';
import { fixtureDirs, readEvalFile, sourceSessionPath } from './lib/fixtures.js';
import { runJudge } from './lib/judge.js';
import { DEFAULT_MODEL, runPiSdk } from './lib/pi.js';
import type { Probe, TokenUsage } from './lib/types.js';

const fixturesRoot = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'suites/om-projection';
const outDir = argValue('--out') ?? `runs/om-projection-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const extensionPath = argValue('--extension') ?? '/tmp/pi-observational-memory';
const model = argValue('--model') ?? DEFAULT_MODEL;
const judgeModel = argValue('--judge-model') ?? model;

function addUsage(a: TokenUsage, u?: TokenUsage): TokenUsage {
  return {
    input: (a.input ?? 0) + (u?.input ?? 0),
    output: (a.output ?? 0) + (u?.output ?? 0),
    cacheRead: (a.cacheRead ?? 0) + (u?.cacheRead ?? 0),
    cacheWrite: (a.cacheWrite ?? 0) + (u?.cacheWrite ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (u?.totalTokens ?? 0),
  };
}

function compactionSummary(compaction: unknown): string {
  const c = compaction as { summary?: unknown; compaction?: { summary?: unknown }; details?: unknown } | undefined;
  const summary = typeof c?.summary === 'string' ? c.summary : typeof c?.compaction?.summary === 'string' ? c.compaction.summary : '';
  return summary;
}

function compactionText(compaction: unknown): string {
  return `Summary:\n${compactionSummary(compaction) || '(empty)'}\n\nRaw compaction JSON:\n${JSON.stringify(compaction, null, 2)}`;
}

fs.mkdirSync(outDir, { recursive: true });
const results = [];
let passed = 0;
let total = 0;
let usage: TokenUsage = {};

for (const fixtureDir of fixtureDirs(fixturesRoot)) {
  const fixture = path.basename(fixtureDir);
  const evalFile = readEvalFile(fixtureDir) as ReturnType<typeof readEvalFile> & { projection_probe?: Probe };
  const probe = evalFile.projection_probe;
  if (!probe) throw new Error(`${fixture}: missing projection_probe in eval.yml`);

  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `pi-om-projection-${fixture}-`)), 'session.jsonl');
  fs.copyFileSync(sourceSessionPath(fixtureDir), sessionFile);
  const run = await runPiSdk('Projection eval probe. Reply READY only.', {
    model,
    sessionFile,
    extensionPaths: [extensionPath],
    compactBeforePrompt: true,
    compactInstructions: evalFile.compact_instructions,
    compactionSettings: evalFile.compaction_settings,
  });
  const answer = compactionText(run.compaction);
  const judged = await runJudge(probe, answer, judgeModel);
  usage = addUsage(addUsage(usage, run.usage), judged.run.usage);
  total += 1;
  if (judged.judge.passed) passed += 1;
  results.push({ fixture, source: sourceSessionPath(fixtureDir), sessionFile, compaction: run.compaction, answer, runUsage: run.usage, stderr: run.stderr, judge: judged.judge, judgeUsage: judged.run.usage });
  console.log(`${fixture}: ${judged.judge.passed ? 'PASS' : 'FAIL'}`);
}

const summary = { kind: 'om-projection', fixturesRoot, extensionPath, model, judgeModel, passed, total, usage };
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`${outDir}/summary.json`);
console.log(`${passed}/${total} passed, tokens=${usage.totalTokens ?? 0}`);
process.exit(passed === total ? 0 : 1);
