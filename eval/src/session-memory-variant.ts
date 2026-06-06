#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { argValue } from './lib/args.js';

const variant = process.argv[2];
const variants = ['clean', 'om-additive', 'om-replacement', 'original'] as const;
if (!variant || variant.startsWith('--') || !variants.includes(variant as never)) {
  throw new Error(`usage: npm run session-memory -- <${variants.join('|')}> --out runs/name [--suite suites/memory-hard]`);
}

const suite = argValue('--suite') ?? 'suites/memory-hard';
const out = argValue('--out') ?? `runs/memory-hard-${variant}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const model = argValue('--model') ?? 'openai-codex/gpt-5.4-mini';
const concurrency = argValue('--concurrency') ?? '1';
const forcedMemoryPrep = process.argv.includes('--forced-memory-prep');
const prepareTurns = argValue('--memory-prepare-turns') ?? '1';
const waitMs = argValue('--memory-prepare-wait-ms') ?? '5000';
const compactInstructions = argValue('--compact-instructions') ?? 'Preserve exact current decisions, corrections, constraints, rejected stale options, and reasons. Prefer newer explicit corrections over older notes/reflections.';
const latestOmExtension = argValue('--om-extension') ?? path.resolve('..', 'extensions', 'pi-observational-memory');
const originalOmExtension = argValue('--original-extension') ?? '/tmp/pi-observational-memory-original';
const cwd = argValue('--cwd') ?? makeCwd(variant, model);

function configuredModel(modelSpec: string) {
  const [provider, ...rest] = modelSpec.split('/');
  return { provider, id: rest.join('/') || 'gpt-5.4-mini', thinking: 'off' };
}

function makeCwd(name: string, modelSpec: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-memory-hard-${name}-`));
  fs.mkdirSync(path.join(dir, '.pi'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pi/settings.json'), JSON.stringify({
    'observational-memory': {
      strategy: name === 'om-replacement' ? 'replacement' : 'additive',
      observeAfterTokens: 1000,
      reflectAfterTokens: 1000000,
      compactAfterTokens: 1000000,
      agentMaxTurns: 4,
      model: configuredModel(modelSpec),
      debugLog: false,
    },
  }, null, 2));
  return dir;
}

function run(cmd: string, args: string[]) {
  console.log(['$', cmd, ...args].join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (r.status !== 0) process.exitCode = r.status ?? 1;
  return r.status ?? 1;
}

function baseArgs(extra: string[] = []) {
  return ['run', 'eval', '--', suite, '--out', out, '--model', model, '--compact-before-prompt', '--compact-instructions', compactInstructions, '--concurrency', concurrency, ...extra];
}

if (variant === 'clean') {
  run('npm', baseArgs());
} else if (variant === 'om-additive' || variant === 'om-replacement') {
  const prepArgs = forcedMemoryPrep ? ['--prepare-memory-before-compact', '--memory-prepare-turns', prepareTurns, '--memory-prepare-wait-ms', waitMs] : ['--memory-trigger-before-compact', '--memory-prepare-wait-ms', waitMs];
  run('npm', baseArgs(['--cwd', cwd, '--extension', latestOmExtension, ...prepArgs, '--allow-tool', 'recall']));
} else if (variant === 'original') {
  const prepArgs = forcedMemoryPrep ? ['--prepare-memory-before-compact', '--memory-prepare-turns', prepareTurns, '--memory-prepare-wait-ms', waitMs] : ['--memory-trigger-before-compact', '--memory-prepare-wait-ms', waitMs];
  run('npm', baseArgs(['--cwd', cwd, '--extension', originalOmExtension, ...prepArgs, '--allow-tool', 'recall']));
}
