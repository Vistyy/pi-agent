#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseSimpleYaml(file) {
  const root = {};
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let currentProbe = null;
  let currentList = null;
  root.probes = [];
  for (const raw of lines) {
    const s = raw.trim();
    if (!s || s.startsWith('#')) continue;
    if (s.startsWith('id:') && !currentProbe) root.id = s.slice(3).trim();
    if (s.startsWith('- id:')) {
      currentProbe = { id: s.split(':').slice(1).join(':').trim() };
      root.probes.push(currentProbe);
      currentList = null;
      continue;
    }
    if (!currentProbe) continue;
    if (s.startsWith('question:')) {
      currentProbe.question = s.split(':').slice(1).join(':').trim();
      currentList = null;
      continue;
    }
    if (s === 'must_contain:' || s === 'must_not_contain:') {
      currentList = s.slice(0, -1);
      currentProbe[currentList] = [];
      continue;
    }
    if (s.startsWith('-') && currentList) currentProbe[currentList].push(s.slice(1).trim());
  }
  return root;
}

function norm(s) { return s.toLocaleLowerCase().replace(/[‐‑‒–—-]/g, ' ').replace(/\s+/g, ' '); }
function includes(haystack, needle) {
  const h = norm(haystack);
  const n = norm(needle);
  if (h.includes(n)) return true;
  const words = n.split(' ').filter(Boolean);
  if (words.length <= 1) return false;
  let pos = 0;
  for (const word of words) {
    const found = h.indexOf(word, pos);
    if (found === -1) return false;
    pos = found + word.length;
  }
  return true;
}
function sourceForFixture(dir) {
  for (const name of ['source.jsonl', 'source.synthetic.jsonl']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`missing source.jsonl or source.synthetic.jsonl in ${dir}`);
}
function fixtureDirs(root) {
  if (fs.existsSync(path.join(root, 'probes.yml'))) return [root];
  return fs.readdirSync(root)
    .map((x) => path.join(root, x))
    .filter((x) => fs.statSync(x).isDirectory() && fs.existsSync(path.join(x, 'probes.yml')));
}
function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

const root = argValue('--fixtures') ?? process.argv[2] ?? 'eval/fixtures';
const execute = process.argv.includes('--execute');
const model = argValue('--model') ?? 'openai-codex/gpt-5.4-mini';
const provider = argValue('--provider');
const outDir = argValue('--out') ?? `eval/runs/${new Date().toISOString().replace(/[:.]/g, '-')}`;

fs.mkdirSync(outDir, { recursive: true });
const results = [];

for (const dir of fixtureDirs(root)) {
  const fixtureId = path.basename(dir);
  const source = sourceForFixture(dir);
  const probes = parseSimpleYaml(path.join(dir, 'probes.yml')).probes;
  for (const probe of probes) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `pi-eval-${fixtureId}-`));
    const sessionFile = path.join(tmp, 'session.jsonl');
    fs.copyFileSync(source, sessionFile);

    const prompt = [
      'Answer the probe using the existing session context only.',
      'Be concise, but include the key decision details and caveats needed to avoid repeating rejected work.',
      'If the session context is insufficient, say exactly: INSUFFICIENT_CONTEXT.',
      '',
      `Probe: ${probe.question}`,
    ].join('\n');

    const args = [
      '--print',
      '--session', sessionFile,
      '--no-tools',
      '--no-extensions',
      '--no-skills',
      '--no-prompt-templates',
      '--no-themes',
      '--no-context-files',
      '--thinking', 'off',
    ];
    if (provider) args.push('--provider', provider);
    if (model) args.push('--model', model);
    args.push(prompt);

    const record = { fixture: fixtureId, probe: probe.id, command: ['pi', ...args], executed: execute };
    if (execute) {
      const started = Date.now();
      const run = spawnSync('pi', args, { encoding: 'utf8', timeout: 120_000 });
      const answer = (run.stdout ?? '').trim();
      const missing = (probe.must_contain ?? []).filter((x) => !includes(answer, x));
      const forbidden = (probe.must_not_contain ?? []).filter((x) => includes(answer, x));
      Object.assign(record, {
        exitCode: run.status,
        durationMs: Date.now() - started,
        answer,
        stderr: run.stderr,
        missing,
        forbidden,
        passed: run.status === 0 && missing.length === 0 && forbidden.length === 0,
      });
    }
    results.push(record);
  }
}

const resultPath = path.join(outDir, execute ? 'results.json' : 'planned-commands.json');
fs.writeFileSync(resultPath, JSON.stringify(results, null, 2));
console.log(resultPath);
if (!execute) {
  console.log('Dry run only. Add --execute to run model calls. Default model: openai-codex/gpt-5.4-mini.');
}
process.exit(results.every((r) => !r.executed || r.passed) ? 0 : 1);
