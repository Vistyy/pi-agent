#!/usr/bin/env tsx
import { argValue, hasArg } from './lib/args.js';
import { DEFAULT_MODEL } from './lib/pi.js';
import { runEval } from './lib/runner.js';

const fixturesRoot = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'fixtures';
const outDir = argValue('--out') ?? `runs/${new Date().toISOString().replace(/[:.]/g, '-')}`;
const model = argValue('--model') ?? DEFAULT_MODEL;
const judgeModel = argValue('--judge-model') ?? model;
const concurrency = Number(argValue('--concurrency') ?? '1');

const result = await runEval({
  fixturesRoot,
  outDir,
  model,
  judgeModel,
  concurrency,
  dryRun: hasArg('--dry-run'),
  calibrate: hasArg('--calibrate'),
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
