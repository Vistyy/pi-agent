#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

function parseProbes(file) {
  const probes = new Map();
  let p = null, section = null;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith('#')) continue;
    if (s.startsWith('- id:')) {
      p = { id: s.split(':').slice(1).join(':').trim(), rubric: { pass_if: [], fail_if: [] } };
      probes.set(p.id, p); section = null; continue;
    }
    if (!p) continue;
    if (s.startsWith('question:')) { p.question = s.split(':').slice(1).join(':').trim(); continue; }
    if (s === 'pass_if:' || s === 'fail_if:') { section = s.slice(0, -1); continue; }
    if (s === 'rubric:' || s === 'must_contain:' || s === 'must_not_contain:') { section = null; continue; }
    if (s.startsWith('-') && section) p.rubric[section].push(s.slice(1).trim());
  }
  return probes;
}

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`judge returned no JSON: ${text}`);
  return JSON.parse(m[0]);
}

const resultsPath = argValue('--results') ?? process.argv[2];
if (!resultsPath) {
  console.error('usage: judge-results.mjs --results eval/runs/<run>/results.json [--fixtures eval/fixtures] [--model openai-codex/gpt-5.4-mini]');
  process.exit(2);
}
const fixturesRoot = argValue('--fixtures') ?? 'eval/fixtures';
const model = argValue('--model') ?? 'openai-codex/gpt-5.4-mini';
const out = argValue('--out') ?? path.join(path.dirname(resultsPath), 'judged-results.json');

const probeCache = new Map();
function probeFor(fixture, probeId) {
  if (!probeCache.has(fixture)) probeCache.set(fixture, parseProbes(path.join(fixturesRoot, fixture, 'probes.yml')));
  const p = probeCache.get(fixture).get(probeId);
  if (!p) throw new Error(`missing probe ${fixture}/${probeId}`);
  return p;
}

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const judged = [];
for (const r of results) {
  const p = probeFor(r.fixture, r.probe);
  const prompt = `You are grading an eval answer. Use only the rubric. Be strict but semantic; do not require exact wording.\n\nQuestion:\n${p.question}\n\nAnswer:\n${r.answer}\n\nPass if:\n${p.rubric.pass_if.map(x => `- ${x}`).join('\n')}\n\nFail if:\n${p.rubric.fail_if.map(x => `- ${x}`).join('\n')}\n\nReturn only JSON:\n{"passed": boolean, "score": 0|1|2|3, "reason": string, "missing": string[], "incorrect": string[]}`;
  const run = spawnSync('pi', [
    '--print', '--no-session', '--no-tools', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--thinking', 'off', '--model', model, prompt
  ], { encoding: 'utf8', timeout: 120_000 });
  let judgment;
  try { judgment = extractJson(run.stdout ?? ''); }
  catch (e) { judgment = { passed: false, score: 0, reason: String(e), missing: [], incorrect: ['judge_parse_error'], raw: run.stdout }; }
  judged.push({ ...r, judge: judgment, judgeExitCode: run.status, judgeStderr: run.stderr });
}
fs.writeFileSync(out, JSON.stringify(judged, null, 2));
console.log(out);
process.exit(judged.every(r => r.judgeExitCode === 0 && r.judge?.passed) ? 0 : 1);
