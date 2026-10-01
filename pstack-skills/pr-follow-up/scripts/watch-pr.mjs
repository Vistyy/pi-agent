#!/usr/bin/env node
// Native observer synthesis. See ../references/watcher.md for scope and source basis.
import { execFile } from 'node:child_process';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const help = `Usage: node scripts/watch-pr.mjs <status|wait> --repo OWNER/REPO --pr NUMBER [--pr NUMBER ...]

Read-only PR facts and bounded watching. Requires Node 20+ and authenticated gh.
  status               Read once. Exit 0 even when attention is needed.
  wait                 Wait for READY, ATTENTION, ENDED, ERROR, or TIMEOUT.
  --interval SECONDS   Poll interval, default 30.
  --timeout SECONDS    Total deadline, default 300. Positive, at most 86400.
  --help               Show this help without querying GitHub.

Prints one JSON object, not polling heartbeats. READY is a GitHub readiness
candidate, not product verification or permission to merge. Exit codes for wait:
0 READY, 2 ATTENTION, 3 ERROR, 4 TIMEOUT, 5 ENDED, 64 usage, 130/143 interrupted.
No mutation, dependency installation, stack discovery, daemon, or state files.
`;
const factsQuery = `query($owner:String!,$repo:String!,$pr:Int!){
 repository(owner:$owner,name:$repo){pullRequest(number:$pr){
 number url state isDraft headRefOid baseRefOid headRefName baseRefName
 baseRef{target{oid}} mergeable mergeStateStatus reviewDecision
 }}}`;
const threadsQuery = `query($owner:String!,$repo:String!,$pr:Int!,$after:String){
 repository(owner:$owner,name:$repo){pullRequest(number:$pr){
 reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor}
 nodes{id isResolved comments(first:1){totalCount nodes{url body path line author{login}}}}}
 }}}`;
const checksQuery = `query($owner:String!,$repo:String!,$pr:Int!,$after:String){
 repository(owner:$owner,name:$repo){pullRequest(number:$pr){
 commits(last:1){nodes{commit{oid statusCheckRollup{state
 contexts(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{
 __typename ... on CheckRun{name status conclusion detailsUrl}
 ... on StatusContext{context state targetUrl}
 }}}}}}
 }}}`;

class Deadline extends Error {}

function options(argv) {
  if (argv.includes('--help')) return null;
  const [mode, ...rest] = argv;
  if (!['status', 'wait'].includes(mode)) throw new Error('Choose status or wait.');
  const { values } = parseArgs({ args: rest, options: {
    repo: { type: 'string' }, pr: { type: 'string', multiple: true },
    interval: { type: 'string', default: '30' }, timeout: { type: 'string', default: '300' },
  } });
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(values.repo ?? ''))
    throw new Error('--repo must be OWNER/REPO.');
  const prs = (values.pr ?? []).map(value => {
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647)
      throw new Error('--pr must be a positive GraphQL Int.');
    return Number(value);
  });
  if (!prs.length || new Set(prs).size !== prs.length)
    throw new Error('Supply one or more distinct --pr numbers.');
  function seconds(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 86400) throw new Error(`${name} must be positive and at most 86400.`);
    return n * 1000;
  }
  const [owner, repo] = values.repo.split('/');
  return { mode, owner, repo, prs, repository: values.repo,
    interval: seconds(values.interval, '--interval'), timeout: seconds(values.timeout, '--timeout') };
}

// GitHub is the validation boundary. Policy below consumes parsed facts only.
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Missing ${label}.`);
  return value;
}
function text(value, label) {
  if (typeof value !== 'string') throw new Error(`Missing ${label}.`);
  return value;
}
function array(value, label) {
  if (!Array.isArray(value)) throw new Error(`Missing ${label}.`);
  return value;
}
function boolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`Missing ${label}.`);
  return value;
}
function enumValue(value, choices, label) {
  if (!choices.includes(value)) throw new Error(`Unknown ${label}: ${JSON.stringify(value)}.`);
  return value;
}
function page(connection) {
  const info = object(connection.pageInfo, 'pageInfo');
  return boolean(info.hasNextPage, 'hasNextPage') ? text(info.endCursor, 'endCursor') : null;
}
function parseFacts(value, pr) {
  if (value.number !== pr) throw new Error('GitHub returned a different PR number.');
  return {
    pr, url: text(value.url, 'PR URL'), state: enumValue(value.state, ['OPEN', 'CLOSED', 'MERGED'], 'PR state'),
    draft: boolean(value.isDraft, 'isDraft'),
    revision: {
      head: text(value.headRefOid, 'headRefOid'), base: text(value.baseRefOid, 'baseRefOid'),
      baseTip: value.baseRef === null ? null : text(object(object(value.baseRef, 'baseRef').target, 'base target').oid, 'base tip'),
      headBranch: text(value.headRefName, 'headRefName'), baseBranch: text(value.baseRefName, 'baseRefName'),
    },
    mergeable: enumValue(value.mergeable, ['MERGEABLE', 'CONFLICTING', 'UNKNOWN'], 'mergeable'),
    mergeState: enumValue(value.mergeStateStatus, ['BEHIND', 'BLOCKED', 'CLEAN', 'DIRTY', 'DRAFT', 'HAS_HOOKS', 'UNKNOWN', 'UNSTABLE'], 'merge state'),
    review: enumValue(value.reviewDecision, [null, 'APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'], 'review decision'),
  };
}
function parseCheck(value) {
  const node = object(value, 'check');
  if (node.__typename === 'StatusContext') {
    const state = enumValue(node.state, ['ERROR', 'EXPECTED', 'FAILURE', 'PENDING', 'SUCCESS'], 'status context');
    return { name: text(node.context, 'check context'), state, url: node.targetUrl,
      bucket: state === 'SUCCESS' ? 'pass' : ['PENDING', 'EXPECTED'].includes(state) ? 'pending' : 'fail' };
  }
  if (node.__typename !== 'CheckRun') throw new Error(`Unknown check type: ${node.__typename}.`);
  const status = enumValue(node.status, ['COMPLETED', 'IN_PROGRESS', 'PENDING', 'QUEUED', 'REQUESTED', 'WAITING'], 'check status');
  const conclusion = enumValue(node.conclusion, [null, 'ACTION_REQUIRED', 'CANCELLED', 'FAILURE', 'NEUTRAL', 'SKIPPED', 'STALE', 'STARTUP_FAILURE', 'SUCCESS', 'TIMED_OUT'], 'check conclusion');
  if (status === 'COMPLETED' && conclusion === null) throw new Error('Completed check has no conclusion.');
  return { name: text(node.name, 'check name'), state: status === 'COMPLETED' ? conclusion : status,
    url: node.detailsUrl, bucket: status !== 'COMPLETED' ? 'pending' : conclusion === 'SUCCESS' ? 'pass' : ['NEUTRAL', 'SKIPPED'].includes(conclusion) ? 'skipping' : 'fail' };
}

function verdict(row) {
  if (row.changed) return { kind: 'ATTENTION', reasons: ['revisions-changed-during-read'] };
  if (row.state !== 'OPEN') return { kind: 'ENDED', reasons: [row.state.toLowerCase()] };
  const reasons = [];
  if (row.draft) reasons.push('draft');
  if (row.mergeable === 'CONFLICTING' || row.mergeState === 'DIRTY') reasons.push('conflicts');
  if (row.threads.length) reasons.push('unresolved-threads');
  if (row.checks.some(check => check.bucket === 'fail') || ['ERROR', 'FAILURE'].includes(row.rollup)) reasons.push('failing-checks');
  if (row.review === 'CHANGES_REQUESTED') reasons.push('changes-requested');
  if (row.review === 'REVIEW_REQUIRED') reasons.push('required-review');
  const pending = row.checks.some(check => check.bucket === 'pending') || ['PENDING', 'EXPECTED'].includes(row.rollup);
  if (!pending && !['CLEAN', 'UNKNOWN', 'DIRTY', 'DRAFT'].includes(row.mergeState)) reasons.push(`github-${row.mergeState.toLowerCase()}`);
  if (reasons.length) return { kind: 'ATTENTION', reasons };
  if (pending) return { kind: 'WAITING', reasons: ['pending-checks'] };
  if (row.mergeable !== 'MERGEABLE' || row.mergeState !== 'CLEAN' || row.revision.baseTip === null)
    return { kind: 'WAITING', reasons: ['unknown-readiness'] };
  return { kind: 'READY', reasons: [] };
}

async function observe(config, deadline, signal) {
  const remaining = () => {
    const ms = deadline - performance.now();
    if (ms <= 0) throw new Deadline();
    return ms;
  };
  async function query(pr, queryText, after = null) {
    const args = ['api', 'graphql', '-f', `query=${queryText}`, '-f', `owner=${config.owner}`,
      '-f', `repo=${config.repo}`, '-F', `pr=${pr}`];
    if (after !== null) args.push('-f', `after=${after}`);
    signal.throwIfAborted();
    const stdout = await new Promise((resolve, reject) => {
      const child = execFile('gh', args, { timeout: Math.max(1, Math.ceil(Math.min(30000, remaining()))), killSignal: 'SIGKILL',
        maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1' } },
      (error, stdout, stderr) => {
        signal.removeEventListener('abort', stop);
        if (error) reject(new Error(`GitHub query failed: ${stderr.trim().slice(0, 1000) || error.message}`));
        else resolve(stdout);
      });
      // execFile's AbortSignal uses SIGTERM even when its timeout uses SIGKILL.
      // Kill the owned child and await close so cancellation cannot strand it.
      const stop = () => child.kill('SIGKILL');
      signal.addEventListener('abort', stop, { once: true });
    });
    remaining();
    const response = object(JSON.parse(stdout), 'GraphQL response');
    if (response.errors?.length) throw new Error(`GraphQL error: ${JSON.stringify(response.errors).slice(0, 1000)}`);
    return object(object(object(response.data, 'data').repository, 'repository').pullRequest, 'pullRequest');
  }
  async function connection(read) {
    const result = [];
    const cursors = new Set();
    let after = null;
    do {
      const connection = await read(after);
      result.push(...array(connection.nodes, 'connection nodes'));
      after = page(connection);
      if (after !== null && cursors.has(after)) throw new Error('GitHub repeated a pagination cursor.');
      cursors.add(after);
    } while (after !== null);
    return result;
  }
  const rows = [];
  for (const pr of config.prs) {
    const initial = parseFacts(await query(pr, factsQuery), pr);
    if (initial.state !== 'OPEN') { rows.push({ ...initial, checks: [], threads: [], rollup: null }); continue; }
    const threads = (await connection(async after => object((await query(pr, threadsQuery, after)).reviewThreads, 'reviewThreads')))
      .map(value => {
        const node = object(value, 'thread');
        if (boolean(node.isResolved, 'isResolved')) return null;
        const comments = object(node.comments, 'thread comments');
        const first = array(comments.nodes, 'thread comments nodes')[0];
        const comment = first === undefined ? null : object(first, 'thread comment');
        const body = comment === null ? '' : text(comment.body, 'comment body');
        return { id: text(node.id, 'thread id'), url: comment?.url ?? null,
          author: comment?.author?.login ?? null, path: comment?.path ?? null, line: comment?.line ?? null,
          excerpt: body.slice(0, 2000), excerptTruncated: body.length > 2000, commentCount: comments.totalCount };
      }).filter(value => value !== null);
    let rollup = null;
    const checks = (await connection(async after => {
      const nodes = array(object((await query(pr, checksQuery, after)).commits, 'commits').nodes, 'commits.nodes');
      if (nodes.length !== 1) throw new Error('Cannot establish the PR head commit for checks.');
      const commit = object(object(nodes[0], 'commit node').commit, 'commit');
      if (commit.oid !== initial.revision.head) throw new Error('Check revision changed during read.');
      if (commit.statusCheckRollup === null) return { nodes: [], pageInfo: { hasNextPage: false } };
      const status = object(commit.statusCheckRollup, 'status rollup');
      rollup = enumValue(status.state, ['ERROR', 'EXPECTED', 'FAILURE', 'PENDING', 'SUCCESS'], 'rollup state');
      return object(status.contexts, 'check contexts');
    })).map(parseCheck);
    const current = parseFacts(await query(pr, factsQuery), pr);
    const changed = initial.state !== current.state || JSON.stringify(initial.revision) !== JSON.stringify(current.revision);
    rows.push(changed ? { ...current, changed: true, previousRevision: initial.revision } : { ...current, checks, threads, rollup });
  }
  // Recheck earlier PRs after reading a multi-PR scope. Never declare a stale stack ready.
  for (let i = 0; i < rows.length - 1; i++) {
    const current = parseFacts(await query(rows[i].pr, factsQuery), rows[i].pr);
    if (rows[i].state !== current.state || JSON.stringify(rows[i].revision) !== JSON.stringify(current.revision))
      rows[i] = { ...current, changed: true, previousRevision: rows[i].revision };
  }
  return rows.map(row => ({ ...row, ...verdict(row) }));
}

function summary(rows) {
  for (const kind of ['ATTENTION', 'ENDED', 'WAITING']) if (rows.some(row => row.kind === kind)) return kind;
  return 'READY';
}
function output(config, kind, rows, extra = {}) {
  console.log(JSON.stringify({ schemaVersion: 1, kind, observedAt: new Date().toISOString(),
    repository: config.repository, rows, ...extra }));
}

async function main() {
  let config;
  try { config = options(process.argv.slice(2)); }
  catch (error) { console.error(`${error.message}\n${help}`); return 64; }
  if (config === null) { console.log(help); return 0; }
  const controller = new AbortController();
  let interruptedCode = 130;
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => { interruptedCode = 143; controller.abort(); });
  const deadline = performance.now() + config.timeout;
  let rows = [], errors = 0;
  while (true) {
    let delay = config.interval;
    try {
      rows = await observe(config, deadline, controller.signal);
      errors = 0;
      const kind = summary(rows);
      if (config.mode === 'status') { output(config, 'STATUS', rows, { assessment: kind }); return 0; }
      if (kind !== 'WAITING') { output(config, kind, rows); return { READY: 0, ATTENTION: 2, ENDED: 5 }[kind]; }
    } catch (error) {
      if (controller.signal.aborted) { output(config, 'INTERRUPTED', rows); return interruptedCode; }
      if (error instanceof Deadline || performance.now() >= deadline) { output(config, 'TIMEOUT', rows); return 4; }
      errors++;
      if (config.mode === 'status' || errors >= 3) { output(config, 'ERROR', rows, { error: error.message }); return 3; }
      delay = Math.min(60000, config.interval * 2 ** (errors - 1));
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) { output(config, 'TIMEOUT', rows); return 4; }
    try { await sleep(Math.min(delay, remaining), undefined, { signal: controller.signal }); }
    catch { output(config, 'INTERRUPTED', rows); return interruptedCode; }
  }
}
process.exitCode = await main();
