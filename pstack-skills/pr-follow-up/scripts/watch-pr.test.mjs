import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const cli = fileURLToPath(new URL('./watch-pr.mjs', import.meta.url));

// Fake the external gh process, not observer functions. Fail on any mutation.
const fakeGh = `#!/usr/bin/env node
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.env.WATCH_FIXTURE, 'utf8'));
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.WATCH_CALLS, JSON.stringify(argv)+'\\n');
if (argv[0] !== 'api' || argv[1] !== 'graphql' || argv.some(a => a.includes('mutation'))) process.exit(99);
const fields = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => {const n=a.indexOf('=');return [a.slice(0,n),a.slice(n+1)];}));
if (fixture.hang) { fs.writeFileSync(process.env.WATCH_PID, String(process.pid)); process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); }
else if (fixture.error) { console.error('access unavailable'); process.exit(1); }
else if (fixture.malformed) { console.log('not JSON'); }
else {
 let state=fs.existsSync(process.env.WATCH_STATE)?JSON.parse(fs.readFileSync(process.env.WATCH_STATE,'utf8')):{facts:0};
 let pr=Number(fields.pr), query=fields.query, pullRequest;
 const facts={number:pr,url:'https://github.com/example/repo/pull/'+pr,state:'OPEN',isDraft:false,
 headRefOid:'head-a',baseRefOid:'base-a',headRefName:'feature',baseRefName:'main',baseRef:{target:{oid:'base-tip-a'}},
 mergeable:'MERGEABLE',mergeStateStatus:'CLEAN',reviewDecision:'APPROVED',...fixture.facts,...(fixture.perPr?.[pr]??{})};
 if(query.includes('reviewThreads')) {
  const nodes=fixture.threadPages?.[fields.after??'first']??fixture.threads??[];
  const next=fixture.threadPages&&fields.after===undefined?'second':null;
  pullRequest={reviewThreads:{nodes,pageInfo:{hasNextPage:next!==null,endCursor:next}}};
 } else if(query.includes('statusCheckRollup')) {
  const pending=fixture.pending || (fixture.transition && state.facts<=2);
  const nodes=fixture.checkPages?.[fields.after??'first']??fixture.checks??[{__typename:'CheckRun',name:'build',status:pending?'IN_PROGRESS':'COMPLETED',conclusion:pending?null:'SUCCESS',detailsUrl:'https://ci.example/build'}];
  const next=fixture.checkPages&&fields.after===undefined?'second':null;
  const rollup=fixture.empty?null:{state:pending?'PENDING':fixture.rollup??'SUCCESS',contexts:{nodes,pageInfo:{hasNextPage:next!==null,endCursor:next}}};
  pullRequest={commits:{nodes:[{commit:{oid:facts.headRefOid,statusCheckRollup:rollup}}]}};
 } else {
  state.facts++;
  if(fixture.changeBase && state.facts>1) facts.baseRef.target.oid='base-tip-b';
  if(fixture.changeHead && state.facts>1) facts.headRefOid='head-b';
  if(fixture.changeEarlier && pr===1 && state.facts>2) facts.headRefOid='head-b';
  pullRequest=facts;
 }
 fs.writeFileSync(process.env.WATCH_STATE,JSON.stringify(state));
 console.log(JSON.stringify({data:{repository:{pullRequest}}}));
}
`;
async function harness(t, fixture) {
  const dir = await mkdtemp(join(tmpdir(), 'watch-pr-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'gh'), fakeGh, { mode: 0o755 });
  await writeFile(join(dir, 'fixture.json'), JSON.stringify(fixture));
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, WATCH_FIXTURE: join(dir, 'fixture.json'),
    WATCH_CALLS: join(dir, 'calls.jsonl'), WATCH_STATE: join(dir, 'state.json'), WATCH_PID: join(dir, 'pid') };
  return {
    dir, env,
    async run(mode = 'wait', extra = []) {
      let result;
      try { result = { ...await exec(process.execPath, [cli, mode, '--repo', 'example/repo', '--pr', '1', '--timeout', '5', '--interval', '0.01', ...extra], { env, timeout: 10000 }), code: 0 }; }
      catch (error) { result = { stdout: error.stdout, stderr: error.stderr, code: error.code }; }
      const lines = result.stdout.trim().split('\n');
      assert.equal(lines.length, 1, 'Only the terminal result goes to stdout.');
      const value = JSON.parse(lines[0]);
      return { ...result, value };
    },
  };
}
const unresolved = { id: 'thread-101', isResolved: false, comments: { totalCount: 1, nodes: [
  { url: 'https://github.com/example/repo/pull/1#discussion_r101', body: 'Check the null input.', path: 'src/a.js', line: 5, author: { login: 'reviewer' } },
] } };

test('ready output preserves current head, associated base and live base tip', async t => {
  const h = await harness(t, {}), r = await h.run();
  assert.equal(r.code, 0); assert.equal(r.value.kind, 'READY');
  assert.deepEqual(r.value.rows[0].revision, { head: 'head-a', base: 'base-a', baseTip: 'base-tip-a', headBranch: 'feature', baseBranch: 'main' });
  assert.deepEqual(r.value.rows[0].checks, [{ name: 'build', state: 'SUCCESS', url: 'https://ci.example/build', bucket: 'pass' }]);
});
test('status reports attention without becoming a watch', async t => {
  const h = await harness(t, { threads: [unresolved] }), r = await h.run('status');
  assert.equal(r.code, 0); assert.equal(r.value.kind, 'STATUS'); assert.equal(r.value.assessment, 'ATTENTION');
  assert.deepEqual(r.value.rows[0].reasons, ['unresolved-threads']);
  assert.equal(r.value.rows[0].threads[0].excerpt, 'Check the null input.');
});
test('required reviews, conflicts, drafts and GitHub blockage are not ready', async t => {
  for (const [facts, reason] of [
    [{ reviewDecision: 'REVIEW_REQUIRED' }, 'required-review'],
    [{ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }, 'conflicts'],
    [{ isDraft: true, mergeStateStatus: 'DRAFT' }, 'draft'],
    [{ mergeStateStatus: 'BLOCKED' }, 'github-blocked'],
    [{ reviewDecision: 'CHANGES_REQUESTED' }, 'changes-requested'],
  ]) {
    const h = await harness(t, { facts }), r = await h.run();
    assert.equal(r.code, 2); assert.equal(r.value.kind, 'ATTENTION'); assert.ok(r.value.rows[0].reasons.includes(reason));
  }
});
test('pagination exposes the 101st thread and later failing check', async t => {
  const h = await harness(t, { threadPages: { first: Array.from({ length: 100 }, (_, i) => ({ id: String(i), isResolved: true })), second: [unresolved] },
    checkPages: { first: [{ __typename: 'StatusContext', context: 'lint', state: 'SUCCESS', targetUrl: 'https://ci.example/lint' }],
      second: [{ __typename: 'CheckRun', name: 'integration', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://ci.example/integration' }] } });
  const r = await h.run();
  assert.equal(r.code, 2); assert.deepEqual(r.value.rows[0].reasons, ['unresolved-threads', 'failing-checks']);
  assert.equal(r.value.rows[0].threads[0].id, 'thread-101'); assert.equal(r.value.rows[0].checks[1].name, 'integration');
});
test('wait handles pending checks internally and emits only the final ready snapshot', async t => {
  const h = await harness(t, { transition: true }), r = await h.run();
  assert.equal(r.code, 0); assert.equal(r.value.kind, 'READY'); assert.equal(r.value.rows[0].checks[0].state, 'SUCCESS');
});
test('pending Code Review Gate has no special bypass', async t => {
  const h = await harness(t, { checks: [{ __typename: 'CheckRun', name: 'Code Review Gate', status: 'IN_PROGRESS', conclusion: null, detailsUrl: null }] });
  const r = await h.run('wait', ['--timeout', '1']);
  assert.equal(r.code, 4); assert.equal(r.value.kind, 'TIMEOUT'); assert.equal(r.value.rows[0].kind, 'WAITING');
});
test('unknown readiness waits rather than claiming success', async t => {
  const h = await harness(t, { facts: { mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' } });
  const r = await h.run('wait', ['--timeout', '1']);
  assert.equal(r.code, 4); assert.deepEqual(r.value.rows[0].reasons, ['unknown-readiness']);
});
test('failed aggregate status blocks readiness even when visible checks passed', async t => {
  const h = await harness(t, { rollup: 'FAILURE' }), r = await h.run();
  assert.equal(r.code, 2); assert.deepEqual(r.value.rows[0].reasons, ['failing-checks']);
  assert.equal(r.value.rows[0].checks[0].bucket, 'pass');
});
test('neutral and skipped checks stay distinguishable, cancelled checks require attention', async t => {
  for (const [conclusion, bucket, code] of [['NEUTRAL', 'skipping', 0], ['SKIPPED', 'skipping', 0], ['CANCELLED', 'fail', 2]]) {
    const h = await harness(t, { checks: [{ __typename: 'CheckRun', name: 'optional', status: 'COMPLETED', conclusion, detailsUrl: null }] });
    const r = await h.run();
    assert.equal(r.code, code); assert.equal(r.value.rows[0].checks[0].state, conclusion);
    assert.equal(r.value.rows[0].checks[0].bucket, bucket);
  }
});
test('moving head or base tip invalidates the collected evidence', async t => {
  for (const fixture of [{ changeHead: true }, { changeBase: true }]) {
    const h = await harness(t, fixture), r = await h.run();
    assert.equal(r.code, 2); assert.deepEqual(r.value.rows[0].reasons, ['revisions-changed-during-read']);
    assert.equal(r.value.rows[0].checks, undefined);
  }
});
test('earlier PR changes during multi-PR collection cannot produce a ready stack', async t => {
  const h = await harness(t, { changeEarlier: true }), r = await h.run('wait', ['--pr', '2']);
  assert.equal(r.code, 2); assert.deepEqual(r.value.rows[0].reasons, ['revisions-changed-during-read']);
  assert.equal(r.value.rows[1].pr, 2);
});
test('no visible checks can be ready only with positive GitHub readiness', async t => {
  const h = await harness(t, { empty: true, facts: { reviewDecision: null } }), r = await h.run();
  assert.equal(r.code, 0); assert.deepEqual(r.value.rows[0].checks, []); assert.equal(r.value.rows[0].rollup, null);
});
test('merged and closed PRs end the watch without claiming readiness', async t => {
  for (const state of ['MERGED', 'CLOSED']) {
    const h = await harness(t, { facts: { state } }), r = await h.run();
    assert.equal(r.code, 5); assert.equal(r.value.kind, 'ENDED'); assert.deepEqual(r.value.rows[0].reasons, [state.toLowerCase()]);
  }
});
test('API errors and malformed responses are explicit failures', async t => {
  for (const fixture of [{ error: true }, { malformed: true }, { facts: { mergeable: 'FUTURE_VALUE' } }]) {
    const h = await harness(t, fixture), r = await h.run();
    assert.equal(r.code, 3); assert.equal(r.value.kind, 'ERROR'); assert.ok(r.value.error.length);
  }
});
test('a hanging gh process is killed at the deadline', async t => {
  const h = await harness(t, { hang: true }), start = performance.now();
  const r = await h.run('wait', ['--timeout', '0.3']);
  assert.equal(r.code, 4); assert.equal(r.value.kind, 'TIMEOUT'); assert.ok(performance.now() - start < 2000);
  const pid = Number(await readFile(join(h.dir, 'pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
test('interrupting the observer terminates its owned gh process', { timeout: 3000 }, async t => {
  const h = await harness(t, { hang: true });
  const child = spawn(process.execPath, [cli, 'wait', '--repo', 'example/repo', '--pr', '1'], { env: h.env });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let stdout = ''; child.stdout.on('data', chunk => stdout += chunk);
  const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));
  let pid;
  for (let i = 0; i < 100; i++) {
    try { pid = Number(await readFile(join(h.dir, 'pid'), 'utf8')); break; } catch { await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  assert.ok(pid); child.kill('SIGTERM');
  assert.equal((await exited).code, 143); assert.equal(JSON.parse(stdout).kind, 'INTERRUPTED');
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
test('help and invalid scope work without executing gh', async t => {
  const h = await harness(t, { error: true });
  const r = await exec(process.execPath, [cli, '--help'], { env: h.env });
  assert.match(r.stdout, /Read-only PR facts/);
  await assert.rejects(exec(process.execPath, [cli, 'wait', '--repo', 'example/repo', '--pr', '0'], { env: h.env }), error => error.code === 64);
  await assert.rejects(readFile(join(h.dir, 'calls.jsonl')), { code: 'ENOENT' });
});
