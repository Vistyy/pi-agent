#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const guides = [
  new URL('../../../user-skills/pr-review/SKILL.md', import.meta.url),
  new URL('../instructions.md', import.meta.url),
];
const sharedHeadings = [
  'Expected depth and breadth',
  'Discover relevant context',
  'Apply our preferences',
  'Inspect the details too',
  'Resolve material uncertainty',
  'Specific investigation cues',
];
const modeHeadings = ['Scope and boundaries', 'Finding threshold', 'Return the assessment'];

function sections(file) {
  const text = readFileSync(file, 'utf8');
  const headings = [...text.matchAll(/^## (.+)$/gm)];
  const prefix = text.slice(0, headings[0]?.index ?? text.length).replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  if (!/^# [^\n]+$/.test(prefix)) throw new Error(`Instructions outside declared sections in ${file.pathname}`);
  const result = new Map();
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i][1];
    if (result.has(heading)) throw new Error(`Duplicate section "${heading}" in ${file.pathname}`);
    if (!sharedHeadings.includes(heading) && !modeHeadings.includes(heading)) {
      throw new Error(`Undeclared section "${heading}" in ${file.pathname}`);
    }
    result.set(heading, text.slice(headings[i].index + headings[i][0].length, headings[i + 1]?.index).trim());
  }
  for (const heading of [...sharedHeadings, ...modeHeadings]) {
    if (!result.has(heading)) throw new Error(`Missing section "${heading}" in ${file.pathname}`);
  }
  const order = headings.map(x => x[1]).filter(x => sharedHeadings.includes(x));
  if (order.join('\n') !== sharedHeadings.join('\n')) {
    throw new Error(`Shared section order differs in ${file.pathname}`);
  }
  return result;
}

try {
  const [pr, own] = guides.map(sections);
  for (const heading of sharedHeadings) {
    if (pr.get(heading) !== own.get(heading)) throw new Error(`Shared section "${heading}" differs between the guides`);
  }
  console.log(`PASS: ${sharedHeadings.length} shared sections match. Only scope, finding threshold and report return are mode-specific.`);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
