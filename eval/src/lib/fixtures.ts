import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { CalibrationExample, EvalFile, Probe } from './types.js';

export function fixtureDirs(root: string, requireCalibration = false): string[] {
  if (fs.existsSync(path.join(root, 'eval.yml'))) return [root];
  return fs.readdirSync(root)
    .map((x) => path.join(root, x))
    .filter((x) => fs.statSync(x).isDirectory())
    .filter((x) => fs.existsSync(path.join(x, 'eval.yml')))
    .filter((x) => !requireCalibration || (readEvalFile(x).calibration?.length ?? 0) > 0)
    .sort();
}

export function readEvalFile(fixtureDir: string): EvalFile {
  return YAML.parse(fs.readFileSync(path.join(fixtureDir, 'eval.yml'), 'utf8')) as EvalFile;
}

export function readProbes(fixtureDir: string): Probe[] {
  return readEvalFile(fixtureDir).probes ?? [];
}

export function readCalibration(fixtureDir: string): CalibrationExample[] {
  return readEvalFile(fixtureDir).calibration ?? [];
}

export function sourceSessionPath(fixtureDir: string): string {
  const privatePath = path.join(fixtureDir, 'source.jsonl');
  if (fs.existsSync(privatePath)) return privatePath;
  const evalFile = readEvalFile(fixtureDir);
  if (evalFile.source_stages?.length) return path.join(fixtureDir, evalFile.source_stages[0]!);
  return path.join(fixtureDir, evalFile.source_session ?? 'source.synthetic.jsonl');
}

export function sourceStagePaths(fixtureDir: string): string[] {
  const evalFile = readEvalFile(fixtureDir);
  return (evalFile.source_stages ?? []).map((stage) => path.join(fixtureDir, stage));
}

export function fixtureId(fixtureDir: string): string {
  return readEvalFile(fixtureDir).id ?? path.basename(fixtureDir);
}
