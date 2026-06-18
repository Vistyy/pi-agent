import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SESSION = '/home/syzom/.pi/agent/sessions/--home-syzom-.pi-agent--/2026-06-11T14-02-51-854Z_019eb6fe-2e4e-732f-b744-4b2cb3123d70.jsonl';

type Entry = { type: string; id: string; timestamp?: string; message?: any; customType?: string; data?: any };
type Observation = { id: string; kind: 'observation'; content: string; createdAt: string; timestamp: string; sourceEntryIds: string[]; sources: string[]; tokenCount?: number };
type Reflection = { id: string; kind: 'reflection'; content: string; createdAt: string; sources: string[]; tokenCount?: number };

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string, fallback: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  return { session: get('--session', DEFAULT_SESSION), out: get('--out', 'src/om/cases/real-session-fixtures.ts') };
}

function readEntries(file: string): Entry[] {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as Entry);
}

const observerSerializationModule = await import(new URL('../../../extensions/pi-observational-memory/src/memory/serialization/observer.ts', import.meta.url).href) as any;
const configModule = await import(new URL('../../../extensions/pi-observational-memory/src/config.ts', import.meta.url).href) as any;
const ledgerModule = await import(new URL('../../../extensions/pi-observational-memory/src/session-ledger/index.ts', import.meta.url).href) as any;

function observerFixture(entries: Entry[], start: number, count: number) {
  const slice = entries.slice(start, start + count);
  const { text, sourceEntryIds } = observerSerializationModule.serializeObserverSourceEntries(slice as any[], {
    toolResultSummaryMaxLines: configModule.DEFAULTS.observerToolResultSummaryMaxLines,
    toolResultErrorMaxLines: configModule.DEFAULTS.observerToolResultErrorMaxLines,
    toolResultLineMaxChars: configModule.DEFAULTS.observerToolResultLineMaxChars,
    toolOutputPolicies: configModule.DEFAULTS.observerToolOutputPolicies,
  });
  return { start, count: sourceEntryIds.length, chunk: text, allowedSourceEntryIds: sourceEntryIds };
}

function obsId(id: string): string { return id.startsWith('obs_') ? id : `obs_${id}`; }
function refId(id: string): string { return id.startsWith('ref_') ? id : `ref_${id}`; }
function sourceId(id: string): string { return id.startsWith('obs_') || id.startsWith('ref_') ? id : obsId(id); }

function normalizeObservation(raw: any): Observation {
  return { ...raw, id: obsId(raw.id), kind: 'observation', createdAt: raw.createdAt ?? raw.timestamp, sources: raw.sources ?? raw.sourceEntryIds ?? [] };
}

function normalizeReflection(raw: any): Reflection {
  return { ...raw, id: refId(raw.id), kind: 'reflection', createdAt: raw.createdAt ?? raw.timestamp ?? '1970-01-01T00:00:00.000Z', sources: (raw.sources ?? raw.supportingObservationIds ?? []).map(sourceId) };
}

function foldedThrough(entries: Entry[], upToEntryId?: string) {
  const folded = ledgerModule.foldLedger(entries as any[], upToEntryId ? { upToEntryId } : {});
  return {
    observations: (folded.unreflectedObservations ?? []).map(normalizeObservation),
    reflections: (folded.reflections ?? []).map(normalizeReflection),
  };
}

function reflectorSnapshots(entries: Entry[]) {
  const snapshots: { entryId: string; coversUpToId?: string; observations: Observation[]; reflections: Reflection[] }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== 'custom' || entry.customType !== 'om.reflections.recorded') continue;
    if (entries[i + 1]?.type === 'custom' && entries[i + 1]?.customType === 'om.reflections.rewritten') continue;
    const prev = entries[i - 1];
    if (!prev?.id) continue;
    const folded = foldedThrough(entries, prev.id);
    if (folded.observations.length === 0) continue;
    snapshots.push({ entryId: entry.id, coversUpToId: entry.data?.coversUpToId, ...folded });
  }
  return snapshots;
}

function reflectorFixture(entries: Entry[], minObservations: number, ordinal = 0) {
  const snapshots = reflectorSnapshots(entries);
  return snapshots.filter((snapshot) => snapshot.observations.length >= minObservations)[ordinal]
    ?? snapshots[ordinal]
    ?? { observations: [], reflections: [] };
}

function rewriteInputPools(entries: Entry[]) {
  const pools: Reflection[][] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== 'custom' || entry.customType !== 'om.reflections.rewritten') continue;
    const prev = entries[i - 1];
    if (!prev?.id) continue;
    const folded = foldedThrough(entries, prev.id);
    const retired = new Set((entry.data?.retiredReflectionIds ?? []).map(refId));
    const input = folded.reflections.filter((reflection: Reflection) => retired.has(reflection.id));
    if (input.length > 0) pools.push(input);
  }
  return pools;
}

function rewritePool(entries: Entry[]) {
  return rewriteInputPools(entries)[0] ?? foldedThrough(entries).reflections;
}

function rewriteFixture(entries: Entry[], start: number, count: number): Reflection[] {
  return rewritePool(entries).slice(start, start + count);
}

const args = parseArgs();
const entries = readEntries(args.session);
const fixtures = {
  realObserver32: observerFixture(entries, 0, 32),
  realObserver64: observerFixture(entries, 32, 64),
  realObserver96: observerFixture(entries, 96, 96),
  realReflector8: reflectorFixture(entries, 8),
  realReflector16: reflectorFixture(entries, 16),
  realRewrite40: rewriteFixture(entries, 0, 40),
  realRewrite80: rewriteFixture(entries, 40, 80),
  realRewrite120: rewriteFixture(entries, 40, 120),
};
const content = `// Generated by eval/src/cli/om-case-miner.ts from ${args.session}\n\n${Object.entries(fixtures).map(([name, value]) => `export const ${name} = ${JSON.stringify(value, null, 2)} as const;`).join('\n\n')}\n`;
fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, content);
console.log(JSON.stringify({ out: args.out, observer: [fixtures.realObserver32.count, fixtures.realObserver64.count, fixtures.realObserver96.count], reflector: [fixtures.realReflector8.observations.length, fixtures.realReflector16.observations.length], rewrite: [fixtures.realRewrite40.length, fixtures.realRewrite120.length] }, null, 2));
