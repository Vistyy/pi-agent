// Rerunnable live CLI verification. Controlled Faux responses, no paid model calls.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { reloadReady, terminalText } from './terminal.mjs';
const execute = promisify(execFile), here = dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'code-review-live-'));
const binary = process.env.HERDR_BIN_PATH || 'herdr', session = 'code-review-verification';
const shell = process.env.SHELL || '/bin/sh';
const env = {
    PATH: process.env.PATH, HOME: root, SHELL: shell, TERM: 'xterm-256color', TMPDIR: root,
    XDG_CONFIG_HOME: join(root, 'config'), XDG_STATE_HOME: join(root, 'state'),
    XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'), XDG_RUNTIME_DIR: root,
    HERDR_CONFIG_PATH: join(root, 'herdr.toml'),
};
await writeFile(env.HERDR_CONFIG_PATH, `onboarding = false\n[terminal]\ndefault_shell = ${JSON.stringify(shell)}\nshell_mode = "non_login"\n`);
const command = args => execute(binary, ['--session', session, ...args], { env, cwd: root, timeout: 90000, maxBuffer: 2000000 });
const controlledBinary = join(root, 'herdr-opening-control.mjs');
await writeFile(controlledBinary, `#!/usr/bin/env node
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2), root = ${JSON.stringify(root)};
if (args[0] === 'pane' && args[1] === 'current' && existsSync(root + '/hold-opening') && !existsSync(root + '/opening-held.json')) {
    writeFileSync(root + '/opening-held.json', JSON.stringify({ pid: process.pid }));
    while (existsSync(root + '/hold-opening')) await new Promise(resolve => setTimeout(resolve, 20));
}
if (args[0] === 'agent' && args[1] === 'start') appendFileSync(root + '/reviewer-starts.jsonl', JSON.stringify(args) + '\\n');
const child = spawn(${JSON.stringify(binary)}, args, { stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exit(1); });
child.on('exit', code => process.exit(code ?? 1));
`);
await chmod(controlledBinary, 0o700);
const cwd = join(root, 'workspace'), payments = join(cwd, 'payments'), orders = join(cwd, 'orders');
await mkdir(payments, { recursive: true }); await mkdir(orders);
const git = async (...args) => (await execute('git', args, { cwd: payments })).stdout.trim();
await git('init', '-b', 'main');
await git('config', 'user.name', 'Verification');
await git('config', 'user.email', 'verification@example.invalid');
await writeFile(join(payments, 'source.ts'), 'export const value = 1;\n');
await git('add', '.'); await git('commit', '-m', 'Verification root');
const initial = await git('rev-parse', 'HEAD');
await writeFile(join(payments, 'source.ts'), 'export const value = 2;\n');
await git('commit', '-am', 'Verification first included');
const firstIncluded = await git('rev-parse', 'HEAD');
await writeFile(join(payments, 'newer.txt'), 'Newer committed source.\n');
await git('add', '.'); await git('commit', '-m', 'Verification latest');
const head = await git('rev-parse', 'HEAD');
for (const args of [['init', '-b', 'main'], ['config', 'user.name', 'Verification'], ['config', 'user.email', 'verification@example.invalid']]) await execute('git', args, { cwd: orders });
await writeFile(join(orders, 'contract.ts'), 'export const value = 1;\n');
await execute('git', ['add', '.'], { cwd: orders }); await execute('git', ['commit', '-m', 'Initial orders'], { cwd: orders });
const orderHead = (await execute('git', ['rev-parse', 'HEAD'], { cwd: orders })).stdout.trim();
await writeFile(join(orders, 'contract.ts'), 'export const value = 2;\n');
await writeFile(join(cwd, 'shared.json'), '{"value":2}\n');
await writeFile(join(root, 'outside.json'), '{"value":2}\n');
const plan = async scope => writeFile(join(root, 'verification-scope.json'), JSON.stringify(scope));
await plan({ title: 'Payments and orders contract', requirements: ['Both services use value 2.'], locations: [
    { kind: 'comparison', repo: 'payments', base: initial, head: 'HEAD' },
    { kind: 'changes', repo: 'orders' }, { kind: 'paths', paths: ['shared.json', join(root, 'outside.json')] },
] });
const extension = resolve(here, '../index.ts'), fixture = join(here, 'faux-provider.ts');
const bridge = join(process.env.PI_CODING_AGENT_DIR || join(process.env.HOME, '.pi', 'agent'), 'extensions/herdr-agent-state.ts');
await readFile(bridge, 'utf8');
const naming = join(dirname(bridge), 'resource-rename/index.ts'), tuicr = join(dirname(bridge), 'tuicr-review/index.ts');
await writeFile(join(root, 'settings.json'), JSON.stringify({ extensions: [extension, fixture, bridge, naming, tuicr], defaultProvider: 'code-review-live', defaultModel: 'fixture', defaultThinkingLevel: 'medium', modelThinkingLevels: { 'code-review-live/fixture': 'low', 'code-review-live/saved-reviewer': 'minimal' }, packages: [], compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: 'off' }));
// Mark Faux configured before native default-model selection reads its availability snapshot.
await writeFile(join(root, 'auth.json'), JSON.stringify({ 'code-review-live': { type: 'api_key', key: 'controlled-faux-no-external-provider' } }), { mode: 0o600 });
const run = async (args) => JSON.parse((await command(args)).stdout).result;
const lines = async (file) => (await readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
const messageText = message => typeof message.content === 'string' ? message.content : message.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
const scopeOf = async file => {
    const seed = (await lines(file)).find(entry => entry.type === 'message' && entry.message.role === 'user');
    assert.ok(seed);
    return JSON.parse(messageText(seed.message).split('Selected scope and revisions:\n')[1]);
};
const authorAssessments = async file => (await lines(file)).filter(entry => entry.type === 'message' && entry.message.role === 'assistant' && messageText(entry.message) === 'Author assessed the returned report against current code and the agreed scope.');
const wait = async (check, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) {
    if (await check())
        return;
    await new Promise(done => setTimeout(done, 100));
} throw new Error('Timed out waiting for observable CLI outcome.'); };
const owned = new Map();
const focused = async (pane) => (await run(['pane', 'get', pane])).pane.focused;
const trace = [];
const agent = async (pane) => (await run(['agent', 'get', pane])).agent;
const readTerminal = async (pane) => (await command(['agent', 'read', pane, '--source', 'detection', '--lines', '40'])).stdout;
const terminal = async pane => terminalText(await readTerminal(pane));
const reload = async (pane, file) => {
    const before = (await lines(file)).filter(entry => entry.type === 'custom' && entry.customType === 'code-review.verification-model').length;
    await run(['agent', 'prompt', pane, '/reload']);
    await wait(async () => {
        if ((await lines(file)).filter(entry => entry.type === 'custom' && entry.customType === 'code-review.verification-model').length <= before) return false;
        return reloadReady(await readTerminal(pane));
    });
};
const processes = async (pane) => (await run(['pane', 'process-info', '--pane', pane])).process_info.foreground_processes;
const live = async (pane, file) => {
    const a = await agent(pane);
    assert.equal(a.agent_session?.value, file);
    assert.equal(a.agent, 'pi');
    await wait(async () => { const state = await agent(pane); return state.interactive_ready === true && !state.launch_pending; });
    const list = await processes(pane);
    const pi = list.find(p => p.name === 'pi');
    assert.ok(pi, 'Actual Pi foreground process missing.');
    process.kill(pi.pid, 0);
    return pi.pid;
};
const remember = async (pane) => { const p = (await run(['pane', 'get', pane])).pane; owned.set(pane, p.terminal_id); };
const close = async (pane) => {
    const p = (await run(['pane', 'get', pane])).pane;
    assert.equal(p.terminal_id, owned.get(pane), 'Pane ownership changed.');
    await run(['pane', 'close', pane]);
    owned.delete(pane);
};
const crash = async (pane, file) => { const pid = await live(pane, file); process.kill(pid, 'SIGKILL'); await wait(async () => !(await processes(pane)).some(p => p.pid === pid)); return pid; };
let authorPane, reviewerPane, server, serverDone, serverError, serverLog, isolation;
try {
    serverLog = await open(join(root, 'herdr-server.log'), 'w');
    server = spawn(binary, ['--session', session, 'server'], { env, cwd: root, stdio: ['ignore', serverLog.fd, serverLog.fd] });
    server.on('error', error => { serverError = error; });
    serverDone = new Promise(resolve => server.once('close', resolve));
    await wait(async () => {
        if (serverError) throw serverError;
        assert.equal(server.exitCode, null, 'Owned headless server exited during startup.');
        const status = JSON.parse((await command(['status', 'server', '--json'])).stdout);
        if (!status.running) return false;
        assert.equal(status.session, session);
        assert.ok(status.socket.startsWith(`${root}/`), 'The test server must not use a user socket.');
        isolation = { session, socket: status.socket, pid: server.pid };
        return true;
    });
    const workspace = await run(['workspace', 'create', '--cwd', cwd, '--label', 'Code review verification', '--no-focus']);
    const author = SessionManager.create(cwd, join(root, 'sessions'));
    author.appendModelChange('code-review-live', 'author');
    author.appendThinkingLevelChange('high');
    author.appendMessage({ role: 'user', content: 'Verification author conversation. PRIVATE_AUTHOR_CONTEXT must never be forwarded.', timestamp: Date.now() });
    const authorFile = author.getSessionFile();
    assert.ok(authorFile);
    const split = await run(['pane', 'split', '--pane', workspace.root_pane.pane_id, '--direction', 'down', '--cwd', cwd, '--env', `PI_CODING_AGENT_DIR=${root}`, '--env', 'PI_OFFLINE=1', '--no-focus']);
    authorPane = split.pane.pane_id;
    await remember(authorPane);
    const authorName = `verify-review-${randomUUID().slice(0, 8)}`;
    let authorStarts = 0;
    const startAuthor = () => run(['agent', 'start', `${authorName}-${authorStarts++}`, '--kind', 'pi', '--pane', authorPane, '--', '--offline', '--session', authorFile, '--model', 'code-review-live/author', '--thinking', 'high', '--no-approve']);
    await startAuthor();
    const firstAuthorPid = await live(authorPane, authorFile);
    const authorModel = (await lines(authorFile)).findLast(e => e.type === 'custom' && e.customType === 'code-review.verification-model');
    assert.equal(authorModel?.data.provider, 'code-review-live');
    assert.equal(authorModel?.data.agentDir, root);
    assert.equal(authorModel?.data.herdrSocket, isolation.socket);
    assert.equal(authorModel?.data.model, 'author');
    assert.equal(authorModel?.data.thinkingLevel, 'high');
    assert.ok(!authorModel?.data.commands.includes('end-review'));
    assert.ok(authorModel?.data.commands.includes('rename'));
    assert.ok(authorModel?.data.tools.includes('name_session'));
    assert.ok(authorModel?.data.tools.includes('tuicr_review'));
    await run(['agent', 'prompt', authorPane, 'Continue the verification author conversation.']);
    await wait(async () => (await lines(authorFile)).some(entry => entry.type === 'message' && entry.message.role === 'assistant'));
    const authorWire = (await lines(join(root, `verification-wire-${firstAuthorPid}.jsonl`)))[0];
    const authorTools = authorWire.messages.flatMap(message => message.role === 'system' ? (message.toolsAdded || []).map(tool => tool.name) : []);
    assert.ok(authorTools.includes('name_session'));
    assert.ok(authorTools.includes('tuicr_review'));
    await run(['agent', 'focus', authorPane]);
    await run(['agent', 'prompt', authorPane, '/review Check payments, orders and their shared config together.']);
    let link;
    await wait(async () => { link = (await lines(authorFile)).find(e => e.type === 'custom' && e.customType === 'code-review.link'); return Boolean(link); });
    const reviewerFile = link.data.reviewer.file, reviewerId = link.data.reviewer.id;
    await wait(async () => { const agents = (await run(['agent', 'list'])).agents; reviewerPane = agents.find(a => a.agent_session?.value === reviewerFile)?.pane_id; return Boolean(reviewerPane); });
    await remember(reviewerPane);
    const firstReviewerPid = await live(reviewerPane, reviewerFile);
    const reviewerModel = (await lines(reviewerFile)).findLast(e => e.type === 'custom' && e.customType === 'code-review.verification-model');
    assert.equal(reviewerModel?.data.provider, 'code-review-live');
    assert.equal(reviewerModel?.data.agentDir, root);
    assert.equal(reviewerModel?.data.herdrSocket, isolation.socket);
    assert.equal(reviewerModel?.data.model, 'fixture');
    assert.equal(reviewerModel?.data.thinkingLevel, 'low');
    assert.ok(reviewerModel?.data.commands.includes('end-review'));
    assert.ok(reviewerModel?.data.commands.includes('rename'));
    assert.ok(!reviewerModel?.data.tools.includes('name_session'));
    assert.ok(!reviewerModel?.data.tools.includes('tuicr_review'));
    assert.ok(reviewerModel?.data.tools.includes('edit'));
    assert.ok(reviewerModel?.data.tools.includes('write'));
    assert.equal(await focused(authorPane), true);
    assert.equal(await focused(reviewerPane), false);
    await wait(async () => (await lines(reviewerFile)).some(e => e.type === 'message' && e.message.role === 'assistant'));
    assert.ok(!(await readFile(reviewerFile, 'utf8')).includes('PRIVATE_AUTHOR_CONTEXT'));
    const guide = await readFile(resolve(here, '../instructions.md'), 'utf8');
    const wire = (await lines(join(root, `verification-wire-${firstReviewerPid}.jsonl`)))[0];
    assert.deepEqual(wire.selectedModel, { provider: 'code-review-live', id: 'fixture' });
    assert.equal(wire.options.reasoning, 'low');
    const declaredTools = wire.messages.flatMap(message => message.role === 'system' ? (message.toolsAdded || []).map(tool => tool.name) : []);
    assert.ok(!declaredTools.includes('name_session'));
    assert.ok(!declaredTools.includes('tuicr_review'));
    assert.ok(declaredTools.includes('edit'));
    assert.ok(declaredTools.includes('write'));
    const system = wire.messages.filter(message => message.role === 'system').map(message => [...(Array.isArray(message.content) ? message.content.filter(block => block.type === 'text').map(block => block.text) : [message.content]), ...Object.values(message.sections || {})].join('\n')).join('\n');
    assert.ok(system.includes(guide));
    const requests = (await lines(reviewerFile)).filter(entry => entry.type === 'message' && entry.message.role === 'user');
    assert.equal(requests.length, 2);
    assert.equal(requests[1].message.content[0].text, 'Start review.');
    assert.deepEqual(await scopeOf(reviewerFile), { title: 'Payments and orders contract', requirements: ['Both services use value 2.'], locations: [
        { kind: 'comparison', repo: payments, base: initial, head, files: ['newer.txt', 'source.ts'] },
        { kind: 'changes', repo: orders, head: orderHead, files: ['contract.ts'] },
        { kind: 'paths', paths: [join(cwd, 'shared.json'), join(root, 'outside.json')] },
    ] });
    await wait(async () => (await lines(authorFile)).filter(entry => entry.type === 'message' && entry.message.role === 'assistant').length >= 3);
    assert.equal((await lines(authorFile)).filter(e => e.type === 'custom_message' && e.customType === 'code-review.report').length, 0);
    trace.push({ step: 'launch', authorPid: firstAuthorPid, reviewerPid: firstReviewerPid, reviewerFile });
    // Resume while alive must focus this process, not launch another writer.
    await run(['agent', 'prompt', authorPane, '/review resume']);
    await new Promise(done => setTimeout(done, 800));
    assert.equal(await live(reviewerPane, reviewerFile), firstReviewerPid);
    await wait(() => focused(reviewerPane));
    assert.equal((await run(['agent', 'list'])).agents.filter(a => a.agent_session?.value === reviewerFile).length, 1);
    await run(['agent', 'prompt', reviewerPane, '/end-review']);
    await wait(async () => (await lines(authorFile)).some(e => e.type === 'custom_message' && e.customType === 'code-review.report'));
    const report = (await lines(authorFile)).find(e => e.type === 'custom_message' && e.customType === 'code-review.report');
    assert.ok(report.content.includes('Complete updated live verification report. Finding A remains. Finding B was resolved.'));
    const publication = (await lines(reviewerFile)).find(e => e.type === 'custom' && e.customType === 'code-review.finalized');
    assert.ok(publication);
    assert.equal(report.details.publicationId, publication.id);
    assert.equal(report.details.reviewerId, reviewerId);
    await wait(async () => (await authorAssessments(authorFile)).length === 1);
    const receiptsBeforeBusy = (await lines(authorFile)).filter(entry => entry.type === 'custom_message' && entry.customType === 'code-review.report').length;
    await run(['agent', 'prompt', authorPane, 'Hold author tool work for verification.']);
    await wait(async () => { try { return JSON.parse(await readFile(join(root, 'author-held.json'), 'utf8')).pid === firstAuthorPid; } catch { return false; } });
    await run(['agent', 'prompt', reviewerPane, 'Recheck finding A before returning the updated report.']);
    await wait(async () => (await lines(reviewerFile)).filter(entry => entry.type === 'message' && entry.message.role === 'assistant').length === 3);
    await run(['agent', 'prompt', reviewerPane, '/end-review']);
    await wait(async () => (await lines(reviewerFile)).filter(entry => entry.type === 'custom' && entry.customType === 'code-review.finalized').length === 2);
    await new Promise(done => setTimeout(done, 1_200));
    assert.equal((await lines(authorFile)).filter(entry => entry.type === 'custom_message' && entry.customType === 'code-review.report').length, receiptsBeforeBusy);
    await writeFile(join(root, 'author-release.json'), '{}');
    await wait(async () => (await authorAssessments(authorFile)).length === 2);
    const busyWire = await lines(join(root, `verification-wire-${firstAuthorPid}.jsonl`));
    assert.ok(busyWire.some(row => row.messages.some(message => message.role === 'toolResult' && message.toolName === 'verification_read' && !message.isError && messageText(message) === '{"value":2}\n') && row.messages.some(message => message.role === 'user' && messageText(message).includes('## Review received'))));
    const busyEntries = await lines(authorFile);
    const resultIndex = busyEntries.findLastIndex(entry => entry.type === 'message' && entry.message.role === 'toolResult' && entry.message.toolName === 'verification_read' && !entry.message.isError && messageText(entry.message) === '{"value":2}\n');
    const assessmentIndex = busyEntries.findLastIndex(entry => entry.type === 'message' && entry.message.role === 'assistant' && messageText(entry.message).includes('Author assessed the returned report'));
    assert.ok(resultIndex >= 0 && assessmentIndex > resultIndex);
    trace.push({ step: 'idle-assessment-and-active-steering', authorPid: firstAuthorPid, assessments: 2 });
    await live(authorPane, authorFile);
    await live(reviewerPane, reviewerFile);
    // Normal model selection changes the reviewer only and is preserved on resume.
    await run(['agent', 'prompt', reviewerPane, '/model code-review-live/saved-reviewer']);
    await wait(async () => (await lines(reviewerFile)).findLast(entry => entry.type === 'model_change')?.modelId === 'saved-reviewer');
    assert.equal((await lines(reviewerFile)).findLast(entry => entry.type === 'thinking_level_change')?.thinkingLevel, 'minimal');
    // Closing the completed reviewer preserves its saved discussion and report.
    const originalMessages = (await lines(reviewerFile)).filter(e => e.type === 'message' && e.message.role === 'assistant').length;
    await close(reviewerPane);
    reviewerPane = undefined;
    await Promise.all([run(['agent', 'prompt', authorPane, '/review resume']), run(['agent', 'prompt', authorPane, '/review resume'])]);
    await wait(async () => { reviewerPane = (await run(['agent', 'list'])).agents.find(a => a.agent_session?.value === reviewerFile)?.pane_id; return Boolean(reviewerPane); });
    await remember(reviewerPane);
    const resumedPid = await live(reviewerPane, reviewerFile);
    assert.notEqual(resumedPid, firstReviewerPid);
    await wait(() => focused(reviewerPane));
    const resumedModel = (await lines(reviewerFile)).findLast(entry => entry.type === 'custom' && entry.customType === 'code-review.verification-model');
    assert.equal(resumedModel?.data.model, 'saved-reviewer');
    assert.equal(resumedModel?.data.thinkingLevel, 'minimal');
    assert.equal((await run(['agent', 'list'])).agents.filter(a => a.agent_session?.value === reviewerFile).length, 1);
    assert.equal((await lines(reviewerFile)).filter(e => e.type === 'message' && e.message.role === 'assistant').length, originalMessages);
    trace.push({ step: 'closed-reviewer-resumed', reviewerPid: resumedPid });
    await close(reviewerPane);
    reviewerPane = undefined;
    await run(['agent', 'focus', authorPane]);
    await run(['pane', 'zoom', '--pane', authorPane, '--on']);
    await writeFile(join(root, 'hold-reviewer-startup'), '');
    await run(['agent', 'prompt', authorPane, `/review resume ${link.id}`]);
    let heldStartup;
    await wait(async () => { try { heldStartup = JSON.parse(await readFile(join(root, 'reviewer-startup-held.json'), 'utf8')); return true; } catch (error) { if (error.code !== 'ENOENT') throw error; return false; } });
    await wait(async () => { reviewerPane = (await run(['agent', 'list'])).agents.find(a => a.launch_pending && a.name?.startsWith('review-'))?.pane_id; return Boolean(reviewerPane); });
    await remember(reviewerPane);
    assert.ok((await processes(reviewerPane)).some(p => p.pid === heldStartup.pid && p.name === 'pi'));
    await wait(() => focused(reviewerPane));
    assert.equal((await agent(reviewerPane)).launch_pending, true);
    const closedAt = Date.now();
    await close(reviewerPane);
    reviewerPane = undefined;
    await wait(async () => (await terminal(authorPane)).includes('Reviewer pane was closed while opening'), 5_000);
    const closedWaitMs = Date.now() - closedAt;
    await wait(async () => { try { process.kill(heldStartup.pid, 0); return false; } catch (error) { if (error.code !== 'ESRCH') throw error; return true; } });
    await unlink(join(root, 'hold-reviewer-startup'));
    await run(['agent', 'prompt', authorPane, `/review resume ${link.id}`]);
    await wait(async () => { reviewerPane = (await run(['agent', 'list'])).agents.find(a => a.agent_session?.value === reviewerFile)?.pane_id; return Boolean(reviewerPane); });
    await remember(reviewerPane);
    const retriedPid = await live(reviewerPane, reviewerFile);
    await wait(() => focused(reviewerPane));
    assert.notEqual(retriedPid, heldStartup.pid);
    assert.equal((await lines(reviewerFile)).filter(e => e.type === 'message' && e.message.role === 'assistant').length, originalMessages);
    trace.push({ step: 'pending-resume-focused-fast-close-and-retry', heldPid: heldStartup.pid, retriedPid, closedWaitMs });
    for (let cycle = 0; cycle < 2; cycle++) {
        const previousPid = await live(reviewerPane, reviewerFile);
        await close(reviewerPane);
        reviewerPane = undefined;
        await run(['agent', 'focus', authorPane]);
        await run(['pane', 'zoom', '--pane', authorPane, '--on']);
        await run(['agent', 'prompt', authorPane, `/review resume ${link.id}`]);
        await wait(async () => { reviewerPane = (await run(['agent', 'list'])).agents.find(a => a.agent_session?.value === reviewerFile)?.pane_id; return Boolean(reviewerPane); });
        await remember(reviewerPane);
        const reviewerPid = await live(reviewerPane, reviewerFile);
        assert.notEqual(reviewerPid, previousPid);
        await wait(() => focused(reviewerPane));
        assert.equal((await lines(reviewerFile)).filter(e => e.type === 'message' && e.message.role === 'assistant').length, originalMessages);
        trace.push({ step: 'repeated-close-and-resume-from-zoomed-author', cycle, reviewerPid });
    }
    // A crashed reviewer can leave stale Herdr name/session metadata behind.
    const deadReviewerPane = reviewerPane;
    const crashedReviewerPid = await crash(deadReviewerPane, reviewerFile);
    await run(['agent', 'prompt', authorPane, '/review resume']);
    await wait(async () => {
        for (const a of (await run(['agent', 'list'])).agents) {
            if (a.agent_session?.value !== reviewerFile || a.pane_id === deadReviewerPane)
                continue;
            if ((await processes(a.pane_id)).some(p => p.name === 'pi')) {
                reviewerPane = a.pane_id;
                return true;
            }
        }
        return false;
    });
    await remember(reviewerPane);
    const afterCrashPid = await live(reviewerPane, reviewerFile);
    assert.notEqual(afterCrashPid, crashedReviewerPid);
    await wait(() => focused(reviewerPane));
    assert.equal((await lines(reviewerFile)).filter(e => e.type === 'message' && e.message.role === 'assistant').length, originalMessages);
    trace.push({ step: 'crashed-reviewer-resumed', reviewerPid: afterCrashPid });
    // Crash during finalization. A resumed discussion must not publish that draft.
    await run(['agent', 'prompt', reviewerPane, 'Explain finding A.']);
    await wait(async () => (await lines(reviewerFile)).filter(e => e.type === 'message' && e.message.role === 'assistant').length === originalMessages + 1);
    const previousFinalization = (await lines(reviewerFile)).findLast(e => e.type === 'custom' && e.customType === 'code-review.finalize-request').id;
    await run(['agent', 'prompt', reviewerPane, '/end-review']);
    let interrupted;
    await wait(async () => { interrupted = (await lines(reviewerFile)).findLast(e => e.type === 'custom' && e.customType === 'code-review.finalize-request'); return interrupted && interrupted.id !== previousFinalization; });
    await crash(reviewerPane, reviewerFile);
    const interruptedPane = reviewerPane;
    await run(['agent', 'prompt', authorPane, '/review resume']);
    await wait(async () => {
        for (const a of (await run(['agent', 'list'])).agents) {
            if (a.agent_session?.value !== reviewerFile || a.pane_id === interruptedPane || a.pane_id === deadReviewerPane)
                continue;
            if ((await processes(a.pane_id)).some(p => p.name === 'pi')) {
                reviewerPane = a.pane_id;
                return true;
            }
        }
        return false;
    });
    await remember(reviewerPane);
    const finalReviewerPid = await live(reviewerPane, reviewerFile);
    await wait(() => focused(reviewerPane));
    await wait(async () => (await lines(reviewerFile)).some(e => e.type === 'custom' && e.customType === 'code-review.finalize-failed' && e.data.requestId === interrupted.id));
    const beforeDiscussion = (await lines(reviewerFile)).filter(e => e.type === 'message' && e.message.role === 'assistant').length;
    await run(['agent', 'prompt', reviewerPane, 'Explain the concern after resuming.']);
    await wait(async () => (await lines(reviewerFile)).filter(e => e.type === 'message' && e.message.role === 'assistant').length === beforeDiscussion + 1);
    await new Promise(done => setTimeout(done, 1200));
    assert.equal((await lines(authorFile)).filter(e => e.type === 'custom_message' && e.customType === 'code-review.report').length, 2);
    await run(['agent', 'prompt', reviewerPane, '/end-review']);
    await wait(async () => (await lines(authorFile)).filter(e => e.type === 'custom_message' && e.customType === 'code-review.report').length === 3);
    const updated = (await lines(authorFile)).findLast(e => e.type === 'custom_message' && e.customType === 'code-review.report');
    assert.ok(updated.content.includes('Complete updated live verification report. Finding A remains. Finding B was resolved.'));
    assert.notEqual(updated.details.publicationId, report.details.publicationId);
    await wait(async () => (await authorAssessments(authorFile)).length === 3);
    trace.push({ step: 'interrupted-finalization-resumed', reviewerPid: finalReviewerPid, reportCount: 3 });
    // Crash only the owned author. The independent reviewer remains alive.
    const crashedAuthorPid = await crash(authorPane, authorFile);
    assert.equal(crashedAuthorPid, firstAuthorPid);
    assert.equal(await live(reviewerPane, reviewerFile), finalReviewerPid);
    const replacement = await run(['pane', 'split', '--pane', workspace.root_pane.pane_id, '--direction', 'down', '--cwd', cwd, '--env', `PI_CODING_AGENT_DIR=${root}`, '--env', 'PI_OFFLINE=1', '--no-focus']);
    authorPane = replacement.pane.pane_id;
    await remember(authorPane);
    await startAuthor();
    const resumedAuthorPid = await live(authorPane, authorFile);
    assert.notEqual(resumedAuthorPid, firstAuthorPid);
    await new Promise(done => setTimeout(done, 1500));
    assert.equal((await lines(authorFile)).filter(e => e.type === 'custom_message' && e.customType === 'code-review.report').length, 3);
    trace.push({ step: 'author-crash-resumed', authorPid: resumedAuthorPid, reviewerPid: finalReviewerPid, reportCount: 3 });
    // Empty /review starts author clarification, not a repository picker.
    await run(['agent', 'focus', authorPane]);
    await run(['pane', 'zoom', '--pane', authorPane, '--on']);
    await run(['agent', 'prompt', authorPane, '/review']);
    await wait(async () => (await terminal(authorPane)).includes('Which services should be included'));
    await writeFile(join(root, 'scope-preparation.txt'), await terminal(authorPane));
    const beforePreparationReload = (await lines(join(root, `verification-wire-${resumedAuthorPid}.jsonl`))).length;
    await reload(authorPane, authorFile);
    const restoredPreparation = (await lines(authorFile)).findLast(entry => entry.type === 'custom' && entry.customType === 'code-review.verification-model');
    assert.ok(restoredPreparation.data.tools.includes('start_review'));
    assert.equal((await lines(join(root, `verification-wire-${resumedAuthorPid}.jsonl`))).length, beforePreparationReload);
    await run(['agent', 'prompt', authorPane, '/review cancel']);
    await wait(async () => (await lines(authorFile)).some(entry => entry.type === 'custom' && entry.customType === 'code-review.prepared'));
    await run(['agent', 'prompt', authorPane, '/review list']);
    await wait(async () => (await terminal(authorPane)).includes('Saved reviews'));
    await run(['agent', 'send-keys', authorPane, 'esc']);
    await plan({ title: 'Committed deployment range', requirements: [], locations: [{ kind: 'comparison', repo: 'payments', base: `${firstIncluded}^1`, head: 'HEAD' }] });
    await run(['agent', 'prompt', authorPane, '/review Compare the first included deployment commit through HEAD in payments.']);
    let rangeLink, rangePane;
    await wait(async () => { rangeLink = (await lines(authorFile)).findLast(entry => entry.type === 'custom' && entry.customType === 'code-review.link'); return rangeLink?.id !== link.id; });
    await wait(async () => { rangePane = (await run(['agent', 'list'])).agents.find(state => state.agent_session?.value === rangeLink.data.reviewer.file)?.pane_id; return Boolean(rangePane); });
    await remember(rangePane);
    await live(rangePane, rangeLink.data.reviewer.file);
    await wait(async () => (await lines(rangeLink.data.reviewer.file)).some(entry => entry.type === 'message' && entry.message.role === 'assistant'));
    const rangeScope = await scopeOf(rangeLink.data.reviewer.file);
    assert.deepEqual(rangeScope, { title: 'Committed deployment range', requirements: [], locations: [{ kind: 'comparison', repo: payments, base: initial, head, files: ['newer.txt', 'source.ts'] }] });
    assert.equal(await focused(authorPane), true);
    const oldBody = await readFile(reviewerFile, 'utf8'), newBody = await readFile(rangeLink.data.reviewer.file, 'utf8');
    assert.ok(!newBody.includes('Complete updated live verification report'));
    assert.ok(oldBody.includes('Complete updated live verification report'));
    trace.push({ step: 'scope-preparation-and-committed-range', reviewerFile: rangeLink.data.reviewer.file, scope: rangeScope });
    // New-review configuration is read through the real author command and child CLI.
    const configured = JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'));
    configured.codeReview = { model: 'code-review-live/saved-reviewer', thinkingLevel: 'high' };
    await writeFile(join(root, 'settings.json'), JSON.stringify(configured));
    await reload(authorPane, authorFile);
    await plan({ title: 'Configured source review', requirements: [], locations: [{ kind: 'paths', paths: ['payments/source.ts'] }] });
    await run(['agent', 'prompt', authorPane, '/review Review payments/source.ts with the configured reviewer defaults.']);
    let configuredLink, configuredPane;
    await wait(async () => { configuredLink = (await lines(authorFile)).findLast(entry => entry.type === 'custom' && entry.customType === 'code-review.link'); return configuredLink?.id !== rangeLink.id; });
    await wait(async () => { configuredPane = (await run(['agent', 'list'])).agents.find(state => state.agent_session?.value === configuredLink.data.reviewer.file)?.pane_id; return Boolean(configuredPane); });
    await remember(configuredPane);
    const configuredPid = await live(configuredPane, configuredLink.data.reviewer.file);
    const selected = (await lines(configuredLink.data.reviewer.file)).findLast(entry => entry.type === 'custom' && entry.customType === 'code-review.verification-model');
    assert.equal(selected?.data.model, 'saved-reviewer');
    assert.equal(selected?.data.thinkingLevel, 'high');
    await wait(async () => (await lines(configuredLink.data.reviewer.file)).some(entry => entry.type === 'message' && entry.message.role === 'assistant'));
    const configuredWire = (await lines(join(root, `verification-wire-${configuredPid}.jsonl`)))[0];
    assert.deepEqual(configuredWire.selectedModel, { provider: 'code-review-live', id: 'saved-reviewer' });
    assert.equal(configuredWire.options.reasoning, 'high');
    assert.equal(await focused(authorPane), true);
    await wait(async () => (await agent(authorPane)).agent_status === 'idle');
    assert.ok(!(await terminal(authorPane)).includes('A review command is already open'));
    await writeFile(join(root, 'hold-opening'), '');
    await plan({ title: 'Overlapping launch and resume', requirements: [], locations: [{ kind: 'paths', paths: ['shared.json'] }] });
    await run(['agent', 'prompt', authorPane, '/review Review shared.json independently.']);
    await wait(async () => { try { await readFile(join(root, 'opening-held.json')); return true; } catch (error) { if (error.code !== 'ENOENT') throw error; return false; } });
    const overlapLink = (await lines(authorFile)).findLast(entry => entry.type === 'custom' && entry.customType === 'code-review.link');
    assert.notEqual(overlapLink.id, configuredLink.id);
    assert.equal((await run(['agent', 'list'])).agents.filter(a => a.agent_session?.value === overlapLink.data.reviewer.file).length, 0);
    await run(['agent', 'prompt', authorPane, `/review resume ${overlapLink.id}`]);
    await run(['agent', 'prompt', authorPane, `/review resume ${overlapLink.id}`]);
    await wait(async () => (await terminal(authorPane)).includes('A review command is already open'));
    await unlink(join(root, 'hold-opening'));
    let overlapAgents;
    await wait(async () => { overlapAgents = (await run(['agent', 'list'])).agents.filter(a => a.agent_session?.value === overlapLink.data.reviewer.file); return overlapAgents.length > 0; });
    const writers = [];
    for (const state of overlapAgents) {
        await remember(state.pane_id);
        writers.push({ pane: state.pane_id, pid: await live(state.pane_id, overlapLink.data.reviewer.file) });
    }
    assert.equal(writers.length, 1, 'Launch and resume must share one live reviewer writer.');
    const overlapPane = writers[0].pane;
    await wait(() => focused(overlapPane));
    await wait(async () => (await lines(overlapLink.data.reviewer.file)).filter(entry => entry.type === 'message' && entry.message.role === 'assistant').length === 1);
    await wait(async () => (await agent(authorPane)).agent_status === 'idle');
    const starts = (await lines(join(root, 'reviewer-starts.jsonl'))).filter(args => args.includes(overlapLink.data.reviewer.file));
    assert.equal(starts.length, 1);
    assert.equal((await run(['agent', 'list'])).agents.filter(a => a.agent_session?.value === overlapLink.data.reviewer.file).length, 1);
    assert.equal((await lines(overlapLink.data.reviewer.file)).filter(entry => entry.type === 'message' && entry.message.role === 'assistant').length, 1);
    trace.push({ step: 'launch-resume-overlap-one-focused-writer', writers, reviewerFile: overlapLink.data.reviewer.file });
    await close(overlapPane);
    await close(configuredPane);
    await close(rangePane);
    await close(reviewerPane);
    const originalResponses = (await lines(reviewerFile)).filter(entry => entry.type === 'message' && entry.message.role === 'assistant').length;
    await run(['agent', 'prompt', authorPane, `/review resume ${link.id}`]);
    await wait(async () => { reviewerPane = (await run(['agent', 'list'])).agents.find(state => state.agent_session?.value === reviewerFile && owned.has(state.pane_id) === false && state.pane_id !== deadReviewerPane && state.pane_id !== interruptedPane)?.pane_id; return Boolean(reviewerPane); });
    await remember(reviewerPane);
    const finalResumedPid = await live(reviewerPane, reviewerFile);
    const unchanged = (await lines(reviewerFile)).findLast(entry => entry.type === 'custom' && entry.customType === 'code-review.verification-model');
    assert.equal(unchanged?.data.model, 'saved-reviewer');
    assert.equal(unchanged?.data.thinkingLevel, 'minimal');
    assert.equal((await lines(reviewerFile)).filter(entry => entry.type === 'message' && entry.message.role === 'assistant').length, originalResponses);
    await wait(() => focused(reviewerPane));
    trace.push({ step: 'configured-new-review-and-saved-resume', configuredPid, finalResumedPid });
    for (const file of [reviewerFile, rangeLink.data.reviewer.file, configuredLink.data.reviewer.file, overlapLink.data.reviewer.file]) {
        for (const entry of await lines(file)) {
            if (entry.type === 'message' && entry.message.role === 'assistant') assert.equal(entry.message.provider, 'code-review-live');
            if (entry.type === 'custom' && entry.customType === 'code-review.verification-model') {
                assert.equal(entry.data.herdrSocket, isolation.socket);
                assert.ok(entry.data.commands.includes('rename'));
                assert.ok(!entry.data.tools.includes('name_session'));
                assert.ok(!entry.data.tools.includes('tuicr_review'));
                assert.ok(entry.data.tools.includes('edit'));
                assert.ok(entry.data.tools.includes('write'));
            }
        }
    }
    await writeFile(join(root, 'result.json'), JSON.stringify({ root, cwd, authorFile, reviewerFile, isolation, trace, preparationRendered: true, scope: 'Real interactive Pi CLI and Herdr panes in a private headless named session, actual two Git repositories and non-Git files, saved JSONL and direct foreground PIDs. Controlled Faux provider, no paid model calls. Scope and lifecycle transport, not model-quality, live cache-hit or GitHub PR verification.' }, null, 2));
    console.log(JSON.stringify({ passed: true, evidence: join(root, 'result.json'), trace }, null, 2));
}
catch (error) {
    const panes = [];
    const observe = async (read) => { try { return await read(); } catch (error) { return { error: String(error) }; } };
    for (const pane of owned.keys()) {
        panes.push({ pane, agent: await observe(() => agent(pane)), processes: await observe(() => processes(pane)), text: await observe(() => readTerminal(pane)) });
    }
    await writeFile(join(root, 'failure.json'), JSON.stringify({ error: String(error), trace, panes }, null, 2));
    console.error(`Failure evidence: ${join(root, 'failure.json')}`);
    throw error;
}
finally {
    try { await unlink(join(root, 'hold-opening')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const pane of [...owned.keys()].reverse()) {
        try {
            await close(pane);
        }
        catch (error) {
            console.error(`Owned pane cleanup blocked for ${pane}: ${error.message}`);
        }
    }
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
        process.kill(server.pid, 0);
        await command(['session', 'stop', '--json', session]);
        await serverDone;
    }
    await serverLog?.close();
}
