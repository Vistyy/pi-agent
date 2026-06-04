#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

function parseProbes(file) {
  const probes = [];
  let p = null, section = null;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith('#')) continue;
    if (s.startsWith('- id:')) { p = { id: s.split(':').slice(1).join(':').trim(), rubric: { pass_if: [], fail_if: [] } }; probes.push(p); section = null; continue; }
    if (!p) continue;
    if (s.startsWith('question:')) { p.question = s.split(':').slice(1).join(':').trim(); continue; }
    if (s === 'pass_if:' || s === 'fail_if:') { section = s.slice(0, -1); continue; }
    if (s === 'rubric:' || s === 'must_contain:' || s === 'must_not_contain:') { section = null; continue; }
    if (s.startsWith('-') && section) p.rubric[section].push(s.slice(1).trim());
  }
  return probes;
}

function parseCalibration(file) {
  const examples = [];
  let ex = null;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s === 'examples:') continue;
    if (s.startsWith('- id:')) { ex = { id: s.split(':').slice(1).join(':').trim() }; examples.push(ex); continue; }
    if (!ex) continue;
    if (s.startsWith('expected_passed:')) ex.expected_passed = s.split(':').slice(1).join(':').trim() === 'true';
    if (s.startsWith('answer:')) ex.answer = s.split(':').slice(1).join(':').trim();
  }
  return examples;
}

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`judge returned no JSON: ${text}`);
  return JSON.parse(m[0]);
}

function fixtureDirs(root) {
  if (fs.existsSync(path.join(root, 'probes.yml'))) return [root];
  return fs.readdirSync(root).map(x => path.join(root, x)).filter(x => fs.statSync(x).isDirectory() && fs.existsSync(path.join(x, 'judge-calibration.yml')));
}

const root = argValue('--fixtures') ?? process.argv[2] ?? 'eval/fixtures';
const model = argValue('--model') ?? 'openai-codex/gpt-5.4-mini';
const out = argValue('--out') ?? `eval/runs/judge-calibration-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
fs.mkdirSync(path.dirname(out), { recursive: true });

const records = [];
for (const dir of fixtureDirs(root)) {
  const fixture = path.basename(dir);
  const probes = parseProbes(path.join(dir, 'probes.yml'));
  if (probes.length !== 1) throw new Error(`calibration currently expects one probe per fixture: ${fixture}`);
  const p = probes[0];
  const examples = parseCalibration(path.join(dir, 'judge-calibration.yml'));
  for (const ex of examples) {
    const prompt = `You are calibrating an eval judge. Use only the rubric. Be strict but semantic; do not require exact wording.\n\nQuestion:\n${p.question}\n\nAnswer:\n${ex.answer}\n\nPass if:\n${p.rubric.pass_if.map(x => `- ${x}`).join('\n')}\n\nFail if:\n${p.rubric.fail_if.map(x => `- ${x}`).join('\n')}\n\nReturn only JSON:\n{"passed": boolean, "score": 0|1|2|3, "reason": string, "missing": string[], "incorrect": string[]}`;
    const run = spawnSync('pi', ['--print', '--no-session', '--no-tools', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--thinking', 'off', '--model', model, prompt], { encoding: 'utf8', timeout: 120_000 });
    let judge;
    try { judge = extractJson(run.stdout ?? ''); }
    catch (e) { judge = { passed: false, score: 0, reason: String(e), missing: [], incorrect: ['judge_parse_error'], raw: run.stdout }; }
    records.push({ fixture, probe: p.id, example: ex.id, expected_passed: ex.expected_passed, judge, passed: run.status === 0 && judge.passed === ex.expected_passed, judgeExitCode: run.status, judgeStderr: run.stderr });
  }
}
fs.writeFileSync(out, JSON.stringify(records, null, 2));
console.log(out);
process.exit(records.every(r => r.passed) ? 0 : 1);
