#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { argValue } from './lib/args.js';

const variant = process.argv[2];
if (!variant || variant.startsWith('--')) throw new Error('usage: npm run session-memory -- <clean|om|vcc|blackhole|blackhole-observed> --out runs/name [--suite suites/session-memory-limits]');
const suite = argValue('--suite') ?? 'suites/session-memory-limits';
const out = argValue('--out') ?? `runs/session-memory-limits-${variant}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const model = argValue('--model') ?? 'openai-codex/gpt-5.4-mini';
const prepareTurns = argValue('--memory-prepare-turns') ?? '6';
const waitMs = argValue('--memory-prepare-wait-ms') ?? '10000';
const compactInstructions = argValue('--compact-instructions') ?? 'Preserve exact current decisions, corrections, constraints, rejected stale options, and reasons. Prefer newer explicit corrections over older notes/reflections.';
const cwd = argValue('--cwd') ?? makeCwd(variant, model);

function makeCwd(name: string, modelSpec: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `pi-session-memory-${name}-`));
  fs.mkdirSync(path.join(dir, '.pi'), { recursive: true });
  const id = modelSpec.split('/').slice(1).join('/') || 'gpt-5.4-mini';
  fs.writeFileSync(path.join(dir, '.pi/settings.json'), JSON.stringify({
    'observational-memory': {
      observeAfterTokens: 1,
      reflectAfterTokens: 1000000,
      compactAfterTokens: 1000000,
      agentMaxTurns: 4,
      model: { provider: 'openai-codex', id, thinking: 'off' },
      passive: false,
      debugLog: false,
    },
    'pi-blackhole': {
      compaction: 'auto',
      compactionEngine: 'blackhole',
      tailBehavior: 'minimal',
      memory: true,
      observeAfterTokens: 1,
      reflectAfterTokens: 1000000,
      compactAfterTokens: 1000000,
      agentMaxTurns: 4,
      model: { provider: 'openai-codex', id, thinking: 'off' },
      debugLog: false,
    },
  }, null, 2));
  return dir;
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  console.log(['$', cmd, ...args].join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', env });
  if (r.status !== 0) process.exitCode = r.status ?? 1;
  return r.status ?? 1;
}

function baseArgs(extra: string[] = []) {
  return ['run', 'eval', '--', suite, '--out', out, '--model', model, '--compact-before-prompt', '--compact-instructions', compactInstructions, '--concurrency', '1', ...extra];
}

function withVccEnv(): NodeJS.ProcessEnv {
  const cfg = path.join(os.tmpdir(), `pi-vcc-eval-${process.pid}.json`);
  fs.writeFileSync(cfg, JSON.stringify({ overrideDefaultCompaction: true, debug: false }, null, 2));
  return { ...process.env, PI_VCC_CONFIG_PATH: cfg };
}

function withBlackholeConfig<T>(fn: () => T, observeAfterTokens = 1): T {
  const agentDir = path.join(os.homedir(), '.pi', 'agent');
  const dir = path.join(agentDir, 'pi-blackhole');
  const cfg = path.join(dir, 'pi-blackhole-config.json');
  fs.mkdirSync(dir, { recursive: true });
  const existed = fs.existsSync(cfg);
  const backup = existed ? fs.readFileSync(cfg) : undefined;
  const id = model.split('/').slice(1).join('/') || 'gpt-5.4-mini';
  fs.writeFileSync(cfg, JSON.stringify({
    debug: false,
    compaction: 'auto',
    compactionEngine: 'blackhole',
    tailBehavior: 'minimal',
    memory: true,
    observeAfterTokens,
    reflectAfterTokens: 1000000,
    compactAfterTokens: 1000000,
    observationsPoolMaxTokens: 20000,
    observationsPoolTargetTokens: 10000,
    reflectorInputMaxTokens: 80000,
    dropperInputMaxTokens: 80000,
    observerChunkMaxTokens: 40000,
    observerPreambleMaxTokens: 0,
    agentMaxTurns: 4,
    model: { provider: 'openai-codex', id, thinking: 'off' },
    sessionFallback: true,
    debugLog: false,
  }, null, 2));
  try { return fn(); }
  finally {
    if (backup) fs.writeFileSync(cfg, backup);
    else if (!existed) fs.rmSync(cfg, { force: true });
  }
}

if (variant === 'clean') {
  run('npm', baseArgs());
} else if (variant === 'om') {
  run('npm', baseArgs(['--cwd', cwd, '--extension', '/tmp/pi-observational-memory', '--prepare-memory-before-compact', '--memory-prepare-turns', prepareTurns, '--memory-prepare-wait-ms', waitMs, '--allow-tool', 'recall']));
} else if (variant === 'vcc') {
  run('npm', baseArgs(['--cwd', cwd, '--extension', '/tmp/pi-vcc', '--allow-tool', 'vcc_recall']), withVccEnv());
} else if (variant === 'blackhole') {
  withBlackholeConfig(() => run('npm', baseArgs(['--cwd', cwd, '--extension', '/tmp/pi-blackhole', '--prepare-memory-before-compact', '--memory-prepare-turns', prepareTurns, '--memory-prepare-wait-ms', waitMs, '--allow-tool', 'recall'])));
} else if (variant === 'blackhole-observed') {
  const materializedSuite = `${out}-materialized-suite`;
  withBlackholeConfig(() => {
    run('npm', ['run', 'materialize-om', '--', suite, '--out', materializedSuite, '--extension', '/tmp/pi-blackhole', '--cwd', cwd, '--turns', prepareTurns, '--wait-ms', waitMs, '--post-filler-turns', '12']);
  }, 1);
  withBlackholeConfig(() => run('npm', ['run', 'eval', '--', materializedSuite, '--out', out, '--model', model, '--compact-before-prompt', '--compact-instructions', compactInstructions, '--concurrency', '1', '--cwd', cwd, '--extension', '/tmp/pi-blackhole', '--allow-tool', 'recall']), 1000000);
} else {
  throw new Error(`unknown variant: ${variant}`);
}
