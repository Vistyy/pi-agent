#!/usr/bin/env tsx
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { argValue } from './lib/args.js';
import { fixtureDirs, readEvalFile, sourceSessionPath } from './lib/fixtures.js';
import { DEFAULT_MODEL, runPiSdk } from './lib/pi.js';

const fixturesRoot = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'suites/compaction-hard';
const outRoot = argValue('--out');
const extensionPath = argValue('--extension') ?? '/tmp/pi-observational-memory';
const model = argValue('--model') ?? DEFAULT_MODEL;
const waitMs = Number(argValue('--wait-ms') ?? '10000');
const turns = Number(argValue('--turns') ?? '3');
const cwdArg = argValue('--cwd');
const observedFile = argValue('--observed-file') ?? 'source.om-observed.synthetic.jsonl';
const postFillerTurns = Number(argValue('--post-filler-turns') ?? '12');

if (!outRoot) throw new Error('missing --out <dir>');

function countOmEntries(file: string): number {
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type?: string; customType?: string })
    .filter((entry) => entry.type === 'custom' && entry.customType?.startsWith('om.'))
    .length;
}

function normalizeSessionHeader(file: string): void {
  const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  if (entries[0]?.type === 'session') {
    entries[0].version = 3;
    if (typeof entries[0].timestamp !== 'string') entries[0].timestamp = '2026-01-01T00:00:00.000Z';
    entries[0].cwd ??= '/tmp/pi-om-eval';
    fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  }
}

function appendPostObservationFiller(file: string, turns: number): void {
  if (turns <= 0) return;
  const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  let parentId = entries.at(-1)?.id ?? entries[0]?.id;
  const filler = 'Post-observation replay filler. No new facts. Preserve prior observational memory; this text only pushes memory ledger entries outside the retained compaction suffix.';
  for (let i = 1; i <= turns; i += 1) {
    const userId = `om_filler_u_${String(i).padStart(2, '0')}`;
    const assistantId = `om_filler_a_${String(i).padStart(2, '0')}`;
    entries.push({ type: 'message', id: userId, parentId, timestamp: `2026-01-01T03:${String(i).padStart(2, '0')}:00.000Z`, message: { role: 'user', content: [{ type: 'text', text: `${filler} Turn ${i}.` }] } });
    entries.push({ type: 'message', id: assistantId, parentId: userId, timestamp: `2026-01-01T03:${String(i).padStart(2, '0')}:10.000Z`, message: { role: 'assistant', content: [{ type: 'text', text: `Noted filler turn ${i}; no new facts.` }] } });
    parentId = assistantId;
  }
  fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
}

function makeOmCwd(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-om-materialize-'));
  fs.mkdirSync(path.join(cwd, '.pi'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.pi/settings.json'), JSON.stringify({
    'observational-memory': {
      observeAfterTokens: 1,
      reflectAfterTokens: 1000000,
      compactAfterTokens: 1000000,
      agentMaxTurns: 4,
      model: { provider: 'openai-codex', id: model.split('/').slice(1).join('/') || 'gpt-5.4-mini', thinking: 'off' },
      passive: false,
      debugLog: false,
    },
  }, null, 2));
  return cwd;
}

const cwd = cwdArg ?? makeOmCwd();
fs.mkdirSync(outRoot, { recursive: true });
const manifest: unknown[] = [];

for (const fixtureDir of fixtureDirs(fixturesRoot)) {
  const name = path.basename(fixtureDir);
  const outDir = path.join(outRoot, name);
  fs.mkdirSync(outDir, { recursive: true });

  const evalFile = readEvalFile(fixtureDir);
  const source = sourceSessionPath(fixtureDir);
  const observedPath = path.join(outDir, observedFile);
  fs.copyFileSync(source, observedPath);
  normalizeSessionHeader(observedPath);

  const before = countOmEntries(observedPath);
  let after = before;
  let lastRun: Awaited<ReturnType<typeof runPiSdk>> | undefined;
  for (let turn = 1; turn <= turns && after <= before; turn += 1) {
    lastRun = await runPiSdk(`Prepare/update observational memory for this synthetic eval session. Preparation turn ${turn}/${turns}. Reply READY only.`, {
      model,
      sessionFile: observedPath,
      cwd,
      extensionPaths: [extensionPath],
      waitAfterPromptMs: waitMs,
    });
    after = countOmEntries(observedPath);
  }

  if (after <= before) {
    throw new Error(`${name}: no OM entries created (${before} -> ${after}). stderr=${lastRun?.stderr ?? ''}`);
  }

  appendPostObservationFiller(observedPath, postFillerTurns);
  const nextEvalFile = { ...evalFile, source_session: observedFile, materialized_by: { tool: 'materialize-om', extension: extensionPath, model, wait_ms: waitMs, turns, post_filler_turns: postFillerTurns } };
  fs.writeFileSync(path.join(outDir, 'eval.yml'), YAML.stringify(nextEvalFile));
  manifest.push({ fixture: name, source, observed: observedPath, omEntriesBefore: before, omEntriesAfter: after, usage: lastRun?.usage });
  console.log(`${name}: om entries ${before} -> ${after}`);
}

fs.writeFileSync(path.join(outRoot, 'materialize-om-manifest.json'), JSON.stringify({ fixturesRoot, outRoot, extensionPath, model, cwd, observedFile, waitMs, turns, postFillerTurns, generatedAt: new Date().toISOString(), fixtures: manifest }, null, 2));
console.log(`${outRoot}/materialize-om-manifest.json`);
