import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type RecallUseCase = {
  id: string;
  prompt: string;
  sessionFile: string;
  expectRecall: boolean;
  expectedId?: string;
  requiredAnswerText?: string[];
  forbiddenAnswerText?: string[];
};

type SessionEntry = {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  customType?: string;
  content?: unknown;
  data?: unknown;
};

const TIMESTAMP = '2026-06-21T13:30:00.000Z';

function writeJsonl(entries: SessionEntry[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'om-recall-use-'));
  const file = path.join(dir, 'session.jsonl');
  const header = { type: 'session', version: 3, id: `recall-use-${Date.now()}`, timestamp: TIMESTAMP, cwd: process.cwd() };
  const chained = entries.map((entry, index) => ({ ...entry, parentId: index === 0 ? null : entries[index - 1]?.id ?? null }));
  fs.writeFileSync(file, `${[header, ...chained].map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  return file;
}

function customMessage(id: string, content: string): SessionEntry {
  return { type: 'custom_message', id, parentId: null, timestamp: TIMESTAMP, content };
}

function observationsRecorded(id: string, observations: Array<Record<string, unknown>>, coversUpToId: string): SessionEntry {
  return {
    type: 'custom',
    id,
    parentId: null,
    timestamp: TIMESTAMP,
    customType: 'om.observations.recorded',
    data: { observations, coversUpToId },
  };
}

function reflectionsRecorded(id: string, reflections: Array<Record<string, unknown>>, coversUpToId: string): SessionEntry {
  return {
    type: 'custom',
    id,
    parentId: null,
    timestamp: TIMESTAMP,
    customType: 'om.reflections.recorded',
    data: { reflections, coversUpToId },
  };
}

function recallCommandCase(): RecallUseCase {
  const sourceId = 'src-validation-command';
  const observationId = 'obs_111111111111';
  const reflectionId = 'ref_222222222222';
  const command = 'cd extensions/pi-observational-memory && pnpm run typecheck && pnpm test';
  const entries = [
    observationsRecorded('om-obs-command', [{
      id: observationId,
      kind: 'observation',
      content: `User confirmed the required OM recall-refactor validation command is \`${command}\`.`,
      timestamp: TIMESTAMP,
      createdAt: TIMESTAMP,
      sourceEntryIds: [sourceId],
    }], sourceId),
    reflectionsRecorded('om-ref-command', [{
      id: reflectionId,
      kind: 'reflection',
      content: 'A compacted OM memory contains the required validation command for the recall refactor.',
      sources: [observationId],
      createdAt: TIMESTAMP,
    }], 'om-obs-command'),
  ];
  return {
    id: 'recall-required-for-exact-command',
    sessionFile: writeJsonl(entries),
    prompt: `Compacted memory ${reflectionId} says there is a required validation command for the OM recall refactor, but not the exact command. What exact command should I run?`,
    expectRecall: true,
    expectedId: reflectionId,
    requiredAnswerText: [command],
  };
}

function noSemanticSearchCase(): RecallUseCase {
  const entries = [
    customMessage('src-unrelated', 'User likes concise answers.'),
    observationsRecorded('om-obs-unrelated', [{
      id: 'obs_333333333333',
      kind: 'observation',
      content: 'User likes concise answers.',
      timestamp: TIMESTAMP,
      createdAt: TIMESTAMP,
      sourceEntryIds: ['src-unrelated'],
    }], 'src-unrelated'),
  ];
  return {
    id: 'recall-not-semantic-search',
    sessionFile: writeJsonl(entries),
    prompt: 'Use recall to find any memory about validation commands. I do not have a memory id.',
    expectRecall: false,
    forbiddenAnswerText: ['cd extensions/pi-observational-memory'],
  };
}

export function recallUseCases(): RecallUseCase[] {
  return [recallCommandCase(), noSemanticSearchCase()];
}
