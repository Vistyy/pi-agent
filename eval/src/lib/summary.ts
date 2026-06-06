import fs from 'node:fs';
import path from 'node:path';
import type { JudgedResult, TokenUsage } from './types.js';

function addUsage(a: Required<Pick<TokenUsage, 'input'|'output'|'cacheRead'|'cacheWrite'|'totalTokens'>>, u?: TokenUsage) {
  a.input += u?.input ?? 0;
  a.output += u?.output ?? 0;
  a.cacheRead += u?.cacheRead ?? 0;
  a.cacheWrite += u?.cacheWrite ?? 0;
  a.totalTokens += u?.totalTokens ?? ((u?.input ?? 0) + (u?.output ?? 0) + (u?.cacheRead ?? 0) + (u?.cacheWrite ?? 0));
}

export function writeSummary(results: JudgedResult[], outDir: string, extra: { wallClockMs?: number; calibration?: unknown } = {}) {
  const prepUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
  const answerUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
  const compactionUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
  const judgeUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };
  for (const r of results) {
    addUsage(prepUsage, r.prepUsage);
    addUsage(answerUsage, r.answerUsage ?? (r.prepUsage ? undefined : r.usage));
    addUsage(compactionUsage, r.compactionUsage);
    addUsage(judgeUsage, r.judgeUsage);
  }
  const cases = results.map((r) => ({
    fixture: r.fixture,
    probe: r.probe,
    passed: r.judgeExitCode === 0 && r.judge.passed,
    durationMs: { answer: r.durationMs, judge: (r as unknown as { judgeDurationMs?: number }).judgeDurationMs ?? 0 },
    tokens: {
      prep: r.prepUsage?.totalTokens ?? 0,
      answer: r.answerUsage?.totalTokens ?? (r.prepUsage ? 0 : r.usage?.totalTokens) ?? 0,
      compaction: r.compactionUsage?.totalTokens ?? 0,
      judge: r.judgeUsage?.totalTokens ?? 0,
      total: (r.usage?.totalTokens ?? 0) + (r.judgeUsage?.totalTokens ?? 0),
    },
    classification: r.classification ?? (r.judge.passed ? 'pass' : undefined),
    failure: r.judge.passed ? undefined : { classification: r.classification, reason: r.judge.reason, missing: r.judge.missing, incorrect: r.judge.incorrect },
  }));
  const summary = {
    total: results.length,
    passed: cases.filter((c) => c.passed).length,
    failed: cases.filter((c) => !c.passed),
    durationMs: {
      wallClock: extra.wallClockMs,
      answer: results.reduce((n, r) => n + r.durationMs, 0),
      judge: results.reduce((n, r) => n + ((r as unknown as { judgeDurationMs?: number }).judgeDurationMs ?? 0), 0),
    },
    usage: {
      prep: prepUsage,
      answer: answerUsage,
      compaction: compactionUsage,
      judge: judgeUsage,
      total: {
        input: prepUsage.input + answerUsage.input + compactionUsage.input + judgeUsage.input,
        output: prepUsage.output + answerUsage.output + compactionUsage.output + judgeUsage.output,
        cacheRead: prepUsage.cacheRead + answerUsage.cacheRead + compactionUsage.cacheRead + judgeUsage.cacheRead,
        cacheWrite: prepUsage.cacheWrite + answerUsage.cacheWrite + compactionUsage.cacheWrite + judgeUsage.cacheWrite,
        totalTokens: prepUsage.totalTokens + answerUsage.totalTokens + compactionUsage.totalTokens + judgeUsage.totalTokens,
      },
    },
    calibration: extra.calibration,
    classifications: cases.reduce<Record<string, number>>((acc, c) => {
      const key = c.classification ?? 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    cases,
  };
  const file = path.join(outDir, 'summary.json');
  fs.writeFileSync(file, JSON.stringify(summary, null, 2));
  return summary;
}
