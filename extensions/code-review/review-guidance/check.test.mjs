import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const extension = relative(repo, fileURLToPath(new URL('../', import.meta.url)));
const files = [`${extension}/review-guidance/check.mjs`, 'user-skills/pr-review/SKILL.md', `${extension}/instructions.md`];
const success = 'PASS: 6 shared sections match. Only scope, finding threshold and report return are mode-specific.\n';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'review-guidance-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(repo, file), join(root, file));
  }
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [join(root, files[0])], { cwd: tmpdir(), encoding: 'utf8' });
}

function changeOwn(root, from, to) {
  const file = join(root, files[2]);
  const text = readFileSync(file, 'utf8');
  assert.ok(text.includes(from), 'Mutation must affect the copied guide');
  writeFileSync(file, text.replace(from, to));
}

test('checks the real standalone guides from another working directory without modifying them', () => {
  const before = files.map(file => readFileSync(join(repo, file), 'utf8'));
  const result = run(repo);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, success);
  assert.equal(result.stderr, '');
  assert.deepEqual(files.map(file => readFileSync(join(repo, file), 'utf8')), before);
});

test('allows a mode-specific finding threshold to change', t => {
  const root = fixture(t);
  changeOwn(root, 'This is our own work.', 'This is a revised code-review reporting threshold.');
  const result = run(root);
  assert.equal(result.stdout, success);
  assert.equal(result.status, 0);
});

test('rejects drift in a shared section', t => {
  const root = fixture(t);
  changeOwn(root, 'Read applicable project instructions,', 'Ignore project instructions,');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'FAIL: Shared section "Discover relevant context" differs between the guides\n');
});

test('rejects a missing shared section', t => {
  const root = fixture(t);
  changeOwn(root, '## Discover relevant context\n', '');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing section "Discover relevant context"/);
});

test('rejects a duplicate shared section', t => {
  const root = fixture(t);
  changeOwn(root, '## Discover relevant context\n', '## Discover relevant context\n\n## Discover relevant context\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Duplicate section "Discover relevant context"/);
});

test('rejects an undeclared extra section rather than silently skipping it', t => {
  const root = fixture(t);
  changeOwn(root, '## Discover relevant context\n', '## Untracked review policy\n\nExtra instructions.\n\n## Discover relevant context\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Undeclared section "Untracked review policy"/);
});

test('rejects a missing mode-specific section', t => {
  const root = fixture(t);
  changeOwn(root, '## Finding threshold\n', '');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing section "Finding threshold"/);
});

test('rejects instructions outside declared sections', t => {
  const root = fixture(t);
  changeOwn(root, '# Review our own changes\n', '# Review our own changes\n\nUntracked review policy.\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Instructions outside declared sections/);
});

test('rejects shared section order drift', t => {
  const root = fixture(t);
  changeOwn(root, '## Discover relevant context\n', '## Temporary heading\n');
  changeOwn(root, '## Resolve material uncertainty\n', '## Discover relevant context\n');
  changeOwn(root, '## Temporary heading\n', '## Resolve material uncertainty\n');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Shared section order differs/);
});
