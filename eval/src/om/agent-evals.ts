import fs from 'node:fs';
import path from 'node:path';
import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import { DEFAULT_MODEL } from '../lib/pi.js';
import type { AgentEvalRecord } from './types.js';
import { sumDuration, sumUsage } from './runner.js';
import { allCases } from './cases/index.js';

type Args = { model: string; judgeModel: string; outDir: string; thinkingLevel: ModelThinkingLevel; only?: string; suite: 'baseline' | 'stress' | 'all'; caseTimeoutMs: number };

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (name: string, fallback?: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    model: get('--model', DEFAULT_MODEL)!,
    judgeModel: get('--judge-model', get('--model', DEFAULT_MODEL))!,
    outDir: get('--out', path.join('runs', `om-agent-evals-${Date.now()}`))!,
    thinkingLevel: (get('--thinking', 'low') ?? 'low') as ModelThinkingLevel,
    only: get('--only'),
    suite: (get('--suite', 'baseline') ?? 'baseline') as Args['suite'],
    caseTimeoutMs: Number(get('--case-timeout-ms', '600000') ?? '600000'),
  };
}

export async function main() {
  const args = parseArgs();
  fs.mkdirSync(args.outDir, { recursive: true });
  const suiteCases = allCases.filter((c: any) => args.suite === 'all' || (c.suite ?? 'baseline') === args.suite);
  const cases = args.only ? suiteCases.filter((c) => c.name.includes(args.only!)) : suiteCases;
  const records: AgentEvalRecord[] = [];
  for (const c of cases) {
    try { records.push(await Promise.race([
        c(args.model, args.judgeModel, args.thinkingLevel),
        new Promise<AgentEvalRecord>((_, reject) => setTimeout(() => reject(new Error(`case timed out after ${args.caseTimeoutMs}ms`)), args.caseTimeoutMs)),
      ])); }
    catch (error) {
      records.push({ id: c.name, agent: c.name.startsWith('observer') ? 'observer' : c.name.startsWith('rewrite') ? 'rewrite' : 'reflector', output: undefined, passed: false, durationMs: 0, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
    }
    fs.writeFileSync(path.join(args.outDir, 'results.partial.json'), JSON.stringify(records, null, 2));
  }
  const scoredRecords = records.filter((r) => r.score);
  const summary = {
    passed: records.filter((r) => r.passed).length,
    total: records.length,
    score: scoredRecords.reduce((total, r) => total + (r.score?.score ?? 0), 0),
    maxScore: scoredRecords.reduce((total, r) => total + (r.score?.maxScore ?? 0), 0),
    failed: records.filter((r) => !r.passed).map((r) => ({ id: r.id, agent: r.agent, judge: r.judge, error: r.error })),
    durationMs: sumDuration(records, 'durationMs'),
    agentDurationMs: sumDuration(records, 'agentDurationMs'),
    judgeDurationMs: sumDuration(records, 'judgeDurationMs'),
    diagnosisDurationMs: sumDuration(records, 'diagnosisDurationMs'),
    usage: sumUsage(records, 'usage'),
    judgeUsage: sumUsage(records, 'judgeUsage'),
    diagnosisUsage: sumUsage(records, 'diagnosisUsage'),
  };
  fs.writeFileSync(path.join(args.outDir, 'results.json'), JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(args.outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.passed === summary.total ? 0 : 1;
}

