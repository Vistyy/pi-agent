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

function textContent(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => part?.type === 'text' ? part.text : part?.type === 'thinking' ? '[thinking omitted]' : '').filter(Boolean).join('\n');
}

function time(entry: Entry, msg: any): string {
  return String(msg?.timestamp ?? entry.timestamp ?? '').replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

function renderMessage(entry: Entry): string | undefined {
  const msg = entry.message;
  if (!msg || typeof msg !== 'object') return undefined;
  if (msg.role === 'user') return `[User @ ${time(entry, msg)}]: ${textContent(msg.content).trim()}`;
  if (msg.role === 'assistant') return `[Assistant @ ${time(entry, msg)}]: ${textContent(msg.content).trim()}`;
  if (msg.role === 'toolResult') {
    const body = textContent(msg.content).trim();
    const omitted = msg.isError ? 'false' : 'true (policy)';
    return `[Tool evidence: ${msg.toolName ?? 'unknown'} @ ${time(entry, msg)}]\nstatus: ${msg.isError ? 'error' : 'ok'}\noutput_chars: ${body.length}\noutput_omitted: ${omitted}\nexcerpt:\n${msg.isError ? body.split('\n').slice(0, 12).join('\n') : '[output omitted by observer policy]'}`;
  }
  if (msg.role === 'bashExecution') {
    const body = String(msg.output ?? '').trim();
    const lines = body.split('\n');
    const excerpt = lines.length > 12 ? [...lines.slice(0, 6), `… [truncated middle ${lines.length - 12} lines]`, ...lines.slice(-6)].join('\n') : body;
    return `[Tool evidence: bash @ ${time(entry, msg)}]\nstatus: ${msg.exitCode ? 'error' : 'ok'}\noutput_chars: ${body.length}\ninput: ${msg.command ?? ''}\nexitCode: ${msg.exitCode ?? 'unknown'}\noutput_omitted: ${lines.length > 12 ? 'true (length)' : 'false'}\nexcerpt:\n${excerpt}`;
  }
  return undefined;
}

function observerFixture(entries: Entry[], start: number, count: number) {
  const slice = entries.filter((entry) => entry.type === 'message').slice(start, start + count);
  const blocks: string[] = [];
  const allowedSourceEntryIds: string[] = [];
  for (const entry of slice) {
    const rendered = renderMessage(entry);
    if (!rendered?.trim()) continue;
    allowedSourceEntryIds.push(entry.id);
    blocks.push(`[Source entry id: ${entry.id}]\n${rendered}`);
  }
  return { start, count: allowedSourceEntryIds.length, chunk: blocks.join('\n\n'), allowedSourceEntryIds };
}

function obsId(id: string): string { return id.startsWith('obs_') ? id : `obs_${id}`; }
function refId(id: string): string { return id.startsWith('ref_') ? id : `ref_${id}`; }
function sourceId(id: string): string { return id.startsWith('obs_') || id.startsWith('ref_') ? id : obsId(id); }

function observationsFrom(entries: Entry[], start: number, count: number): Observation[] {
  const out: Observation[] = [];
  for (const entry of entries) {
    if (entry.type !== 'custom' || entry.customType !== 'om.observations.recorded') continue;
    for (const raw of entry.data?.observations ?? []) {
      if (raw?.id && raw?.content && raw?.timestamp && Array.isArray(raw.sourceEntryIds)) out.push({ ...raw, id: obsId(raw.id), kind: 'observation', createdAt: raw.createdAt ?? raw.timestamp, sources: raw.sourceEntryIds });
    }
  }
  return out.slice(start, start + count);
}

function reflectionsFrom(entries: Entry[], start: number, count: number): Reflection[] {
  const out: Reflection[] = [];
  for (const entry of entries) {
    if (entry.type !== 'custom' || entry.customType !== 'om.reflections.recorded') continue;
    for (const raw of entry.data?.reflections ?? []) {
      const rawSources = raw?.sources ?? raw?.supportingObservationIds;
      if (raw?.id && raw?.content && Array.isArray(rawSources)) out.push({ id: refId(raw.id), kind: 'reflection', content: raw.content, createdAt: raw.createdAt ?? entry.timestamp ?? '1970-01-01T00:00:00.000Z', sources: rawSources.map(sourceId), tokenCount: raw.tokenCount });
    }
  }
  return out.slice(start, start + count);
}

const args = parseArgs();
const entries = readEntries(args.session);
const fixtures = {
  realObserver32: observerFixture(entries, 0, 32),
  realObserver64: observerFixture(entries, 32, 64),
  realObserver96: observerFixture(entries, 96, 96),
  realReflector8: observationsFrom(entries, 0, 8),
  realReflector16: observationsFrom(entries, 8, 16),
  realRewrite40: reflectionsFrom(entries, 0, 40),
  realRewrite120: reflectionsFrom(entries, 40, 120),
};
const content = `// Generated by eval/src/cli/om-case-miner.ts from ${args.session}\n\n${Object.entries(fixtures).map(([name, value]) => `export const ${name} = ${JSON.stringify(value, null, 2)} as const;`).join('\n\n')}\n`;
fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, content);
console.log(JSON.stringify({ out: args.out, observer: [fixtures.realObserver32.count, fixtures.realObserver64.count, fixtures.realObserver96.count], reflector: [fixtures.realReflector8.length, fixtures.realReflector16.length], rewrite: [fixtures.realRewrite40.length, fixtures.realRewrite120.length] }, null, 2));
