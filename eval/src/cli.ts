#!/usr/bin/env tsx
import { argValue, hasArg } from './lib/args.js';
import { DEFAULT_MODEL } from './lib/pi.js';
import { runEval } from './lib/runner.js';

const fixturesRoot = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'suites/smoke';
const outDir = argValue('--out') ?? `runs/${new Date().toISOString().replace(/[:.]/g, '-')}`;
const model = argValue('--model') ?? DEFAULT_MODEL;
const judgeModel = argValue('--judge-model') ?? model;
const concurrency = Number(argValue('--concurrency') ?? '1');
const extensionPaths = process.argv.flatMap((arg, index, argv) => arg === '--extension' ? [argv[index + 1]].filter(Boolean) : []);
const allowedTools = process.argv.flatMap((arg, index, argv) => arg === '--allow-tool' ? [argv[index + 1]].filter(Boolean) : []);
const cwd = argValue('--cwd');

const result = await runEval({
  fixturesRoot,
  outDir,
  model,
  judgeModel,
  concurrency,
  dryRun: hasArg('--dry-run'),
  calibrate: hasArg('--calibrate'),
  extensionPaths,
  compactBeforePrompt: hasArg('--compact-before-prompt') ? true : undefined,
  compactInstructions: argValue('--compact-instructions'),
  allowedTools,
  cwd,
  prepareMemoryBeforeCompact: hasArg('--prepare-memory-before-compact'),
  memoryPrepareWaitMs: Number(argValue('--memory-prepare-wait-ms') ?? '5000'),
  memoryPrepareTurns: Number(argValue('--memory-prepare-turns') ?? '1'),
});

if ('planned' in result && result.planned) {
  console.log(result.planned);
  console.log(`Dry run only. Remove --dry-run to run model calls. Default model: ${DEFAULT_MODEL}.`);
} else if (result.summary) {
  console.log(`${outDir}/summary.json`);
  console.log(`${result.summary.passed}/${result.summary.total} passed, tokens=${result.summary.usage.total.totalTokens}`);
} else if ('calibration' in result && result.calibration) {
  console.log(result.calibration.out);
  console.log('calibration failed');
}

process.exit(result.passed ? 0 : 1);
