import fs from 'node:fs';
import path from 'node:path';
import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import { DEFAULT_MODEL } from '../lib/pi.js';
import type { AgentEvalRecord } from './types.js';
import { sumDuration, sumUsage } from './runner.js';
import { allCases } from './cases/index.js';

type Args = { model: string; judgeModel: string; outDir: string; thinkingLevel: ModelThinkingLevel; only?: string };

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
    thinkingLevel: (get('--thinking', 'xhigh') ?? 'xhigh') as ModelThinkingLevel,
    only: get('--only'),
  };
}

export async function main() {
  const args = parseArgs();
  fs.mkdirSync(args.outDir, { recursive: true });
  const cases = args.only ? allCases.filter((c) => c.name.includes(args.only!)) : allCases;
  const records: AgentEvalRecord[] = [];
  for (const c of cases) {
    try { records.push(await c(args.model, args.judgeModel, args.thinkingLevel)); }
    catch (error) {
      records.push({ id: c.name, agent: c.name.startsWith('observer') ? 'observer' : c.name.startsWith('reflector') ? 'reflector' : 'curator', output: undefined, passed: false, durationMs: 0, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
    }
    fs.writeFileSync(path.join(args.outDir, 'results.partial.json'), JSON.stringify(records, null, 2));
  }
  const summary = {
    passed: records.filter((r) => r.passed).length,
    total: records.length,
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

