#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { argValue } from '../lib/args.js';
import { DEFAULT_MODEL, runPiSdk } from '../lib/pi.js';

const input = process.argv[2];
if (!input || input.startsWith('--')) throw new Error('usage: npm run mine-historical -- <session.jsonl> --out scratch/candidates.json');
const out = argValue('--out') ?? 'scratch-historical/candidate-probes.json';
const model = argValue('--model') ?? DEFAULT_MODEL;
const maxChars = Number(argValue('--max-chars') ?? '60000');

function entryText(entry: any): string {
  if (entry.type === 'session') return `[session] cwd=${entry.cwd ?? ''}`;
  if (entry.type === 'compaction') return `[compaction] summary=${entry.summary ?? ''}`;
  if (entry.type === 'custom') return `[custom:${entry.customType ?? ''}] ${JSON.stringify(entry).slice(0, 1200)}`;
  const msg = entry.message;
  if (!msg) return `[${entry.type}] ${JSON.stringify(entry).slice(0, 500)}`;
  const content = Array.isArray(msg.content) ? msg.content.map((c: any) => {
    if (c.type === 'text') return c.text ?? '';
    if (c.type === 'toolCall') return `[toolCall ${c.name ?? ''}] ${JSON.stringify(c.arguments ?? {})}`;
    if (c.type === 'toolResult') return `[toolResult ${c.name ?? ''}] ${String(c.result ?? c.text ?? '').slice(0, 2000)}`;
    return `[${c.type}] ${JSON.stringify(c).slice(0, 500)}`;
  }).join('\n') : String(msg.content ?? '');
  return `[${msg.role}] ${content}`;
}

function renderSession(file: string): string {
  const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const rendered = entries.map((entry: any, i: number) => `#${i} id=${entry.id ?? ''} type=${entry.type}\n${entryText(entry)}`).join('\n\n');
  if (rendered.length <= maxChars) return rendered;
  const head = rendered.slice(0, Math.floor(maxChars * 0.35));
  const tail = rendered.slice(rendered.length - Math.floor(maxChars * 0.65));
  return `${head}\n\n...[middle omitted for mining budget]...\n\n${tail}`;
}

const transcript = renderSession(input);
const prompt = `You are mining eval probes from a historical Pi coding-agent session.

Goal: propose hard, user-visible memory-after-compaction probes.

Rules:
- Do not reveal or reproduce secrets. If a candidate depends on a secret/token/private credential, skip it.
- Prefer facts that are easy to lose after compaction: corrections, rejected options, exact errors, exact paths, tool-result-only facts, unresolved decisions, current-vs-stale decisions, user constraints.
- Each candidate must cite concrete evidence entry numbers from the transcript.
- Questions must be answerable from session context only.
- Rubrics must be strict but semantic.
- Do not invent facts. If evidence is ambiguous, mark confidence low.

Return only JSON:
{
  "candidates": [
    {
      "id": "kebab-case",
      "question": "...",
      "pass_if": ["..."],
      "fail_if": ["..."],
      "evidence_entry_numbers": [1,2],
      "why_hard": "...",
      "secret_risk": "none|low|medium|high",
      "confidence": "low|medium|high"
    }
  ]
}

Transcript:
${transcript}`;

fs.mkdirSync(path.dirname(out), { recursive: true });
const run = await runPiSdk(prompt, { model, systemPrompt: 'Strict JSON generator. Return only valid JSON.', cwd: process.cwd() });
const rawOut = out.replace(/\.json$/, '.raw.txt');
fs.writeFileSync(rawOut, run.stdout);
let parsed: unknown = { error: 'parse_failed', raw: run.stdout, stderr: run.stderr };
try {
  const m = run.stdout.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON object');
  parsed = JSON.parse(m[0]);
} catch (e) {
  parsed = { error: String(e), raw: run.stdout, stderr: run.stderr };
}
fs.writeFileSync(out, JSON.stringify({ source: input, model, generatedAt: new Date().toISOString(), usage: run.usage, result: parsed }, null, 2));
console.log(out);
console.log(`raw=${rawOut}`);
console.log(`tokens=${run.usage?.totalTokens ?? 0}`);
