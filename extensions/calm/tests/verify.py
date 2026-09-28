import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--pi', default=shutil.which('pi'))
parser.add_argument('--pstack', type=Path)
parser.add_argument('--mode', choices=['fullscreen', 'regular'], default='fullscreen')
args = parser.parse_args()
if not args.pi:
    raise RuntimeError('An installed Pi CLI is required.')
run = Path(tempfile.mkdtemp(prefix='pi-calm-verify-'))
agent = run / 'agent'
(agent / 'extensions').mkdir(parents=True)
(agent / 'extensions/calm').symlink_to(ROOT, target_is_directory=True)
(agent / 'settings.json').write_text(json.dumps({'quietStartup': True, 'hideThinkingBlock': True,
    'retry': {'enabled': False}, 'compaction': {'enabled': False}, 'terminal': {'clearOnShrink': True}}))
(run / 'note.txt').write_text('BEFORE\n')
(run / 'overlay.txt').write_text('OVERLAY_TOOL_RESULT\n')
socket = f'calm-{run.name}'
print(f'Evidence {run}', flush=True)
SPINNER = r'[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]'


def activity_row(text):
    return next((line.rstrip() for line in text.splitlines() if re.match(rf'^(?:{SPINNER}|\?) (?:Thinking|Running|Responding|Waiting)', line)), '')


def tmux(*words):
    return subprocess.check_output(['tmux', '-L', socket, *words], text=True, stderr=subprocess.PIPE)


def screen():
    return tmux('capture-pane', '-p', '-t', 'probe')


def events():
    path = run / 'events.jsonl'
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def count(kind):
    return sum(event['type'] == kind for event in events())


def wait(predicate, label, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise RuntimeError(f'Timed out waiting for {label}')


def send(text):
    tmux('send-keys', '-l', '-t', 'probe', text)
    wait(lambda: any(line.strip() == text for line in screen().splitlines()), 'editor accepted input')
    tmux('send-keys', '-t', 'probe', 'Enter')


def event_command(text, kind):
    before = count(kind)
    send(text)
    wait(lambda: count(kind) > before, text)


def capture(label, pages=False):
    original = screen()
    (run / f'{label}-viewport.txt').write_text(original)
    (run / f'{label}-ansi.txt').write_text(tmux('capture-pane', '-e', '-p', '-t', 'probe'))
    output = [original]
    if pages and args.mode == 'fullscreen':
        for _ in range(16):
            tmux('send-keys', '-t', 'probe', 'PageUp')
            time.sleep(0.08)
            earlier = screen()
            if earlier == output[-1]:
                break
            output.append(earlier)
        for _ in range(len(output) + 2):
            tmux('send-keys', '-t', 'probe', 'PageDown')
            time.sleep(0.04)
    elif pages:
        output = [tmux('capture-pane', '-p', '-S', '-2000', '-t', 'probe')]
    text = '\n--- viewport ---\n'.join(reversed(output))
    (run / f'{label}.txt').write_text(text)
    return text


def launch(session='parent.jsonl'):
    restoring = session == 'parent.jsonl' and (run / session).exists()
    argv = [args.pi, '--offline', '--approve', '--session', str(run / session),
        '--no-skills', '--no-themes', '--no-context-files', '--no-prompt-templates',
        '-e', str(ROOT / 'tests/fixture.ts'), '--provider', 'calm-fixture', '--model', 'scripted',
        '--thinking', 'low', '--tui-mode', args.mode]
    if args.pstack:
        argv += ['-e', str(args.pstack.resolve() / 'extensions/index.ts')]
    env = {'PI_CODING_AGENT_DIR': str(agent), 'PI_OFFLINE': '1', 'CALM_VERIFY_DIR': str(run)}
    import shlex
    invocation = 'exec env ' + ' '.join(shlex.quote(f'{key}={value}') for key, value in env.items()) + ' ' + shlex.join(argv)
    before = count('ready')
    tmux('new-session', '-d', '-s', 'probe', '-x', '160', '-y', '44', '-c', str(run), invocation)
    tmux('set-option', '-t', 'probe', 'remain-on-exit', 'on')
    tmux('pipe-pane', '-o', '-t', 'probe', f'cat >> {shlex.quote(str(run / "terminal.log"))}')
    wait(lambda: count('ready') > before, 'Pi startup')
    wait(lambda: 'scripted' in screen(), 'initial terminal frame')
    if restoring:
        wait(lambda: 'VISIBLE_PARTIAL_REPLY' in screen(), 'saved transcript rendered')


def shutdown():
    send('/calm-probe exit')
    wait(lambda: tmux('display-message', '-p', '-t', 'probe', '#{pane_dead}').strip() == '1', 'Pi exit')
    status = tmux('display-message', '-p', '-t', 'probe', '#{pane_dead_status}').strip()
    assert status == '0', f'Pi exited with {status}'
    tmux('kill-session', '-t', 'probe')


passed = []
try:
    launch()
    capture('startup')
    event_command('/calm-probe check', 'checked')
    passed.append('fixed clock column, model phases, spinner frames, brief-call suppression, retained details, failure counts, parallel selection, and preference IO')
    send('fixture-run')
    for gate, expected in [
        ('after-read', rf'{SPINNER} Thinking   \d+s · last read note\.txt'),
        ('after-failure', rf'{SPINNER} Thinking   \d+s · 1 failed · last read missing\.txt \(failed\)'),
        ('after-edit', rf'{SPINNER} Thinking   \d+s · 1 failed · last edit note\.txt'),
    ]:
        wait(lambda: any(event.get('gate') == gate for event in events()), gate)
        time.sleep(0.15)
        frame = capture(gate)
        rail = activity_row(frame)
        assert re.fullmatch(expected, rail), f'{gate} expected a thinking phase and retained detail, got {rail!r}'
        assert re.search(r'\d', rail).start() == 13, 'clock remains in column fourteen'
        time.sleep(1.1)
        assert any(re.fullmatch(expected, line.rstrip()) for line in screen().splitlines()), f'{gate} remains visible while the model is pending'
        (run / gate).write_text('release')
    passed.append('fast completed and failed tools remain named while the model is pending, replacing only the previous call')
    wait(lambda: count('hold-start') == 2, 'both parallel tools active')
    parallel = rf'{SPINNER} Running    \d+s · 1 failed · probe_hold \+1 running'
    wait(lambda: bool(re.fullmatch(parallel, activity_row(screen()))), 'sustained parallel activity rail')
    wide = capture('active-wide', pages=True)
    rail = activity_row(screen())
    assert 'note.txt' not in rail and 'missing.txt' not in rail and '✓' not in rail
    assert re.fullmatch(parallel, rail), 'phase, clock, and details stay together at the left'
    assert re.search(r'\d', rail).start() == 13, 'running keeps the clock in column fourteen'
    assert 'total' not in rail
    assert 'VISIBLE_ASSISTANT_NOTE' in wide
    assert 'HOLD_PARTIAL_a' not in wide and 'HOLD_PARTIAL_b' not in wide
    assert not re.search(r'^\s*read note.txt\s*$', wide, re.M)
    passed.append('default-on hides native tool rows while preserving assistant text and a compact failure indicator')
    for width in [300, 100, 70, 40]:
        tmux('resize-window', '-t', 'probe', '-x', str(width), '-y', '44')
        wait(lambda: bool(re.match(rf'{SPINNER} Running    \d+s · 1 failed', activity_row(screen()))), f'left-aligned rail at width {width}')
        resized = capture(f'active-{width}')
        assert re.search(r'\d', activity_row(resized)).start() == 13, f'fixed clock column at {width} columns'
        if width >= 70:
            assert re.fullmatch(parallel, activity_row(resized)), f'compact spacing at {width} columns'
    tmux('resize-window', '-t', 'probe', '-x', '160', '-y', '44')
    wait(lambda: bool(re.fullmatch(parallel, activity_row(screen()))), 'wide rail restored')
    first = activity_row(capture('spinner-first'))
    wait(lambda: (row := activity_row(screen())) and row[0] != first[0], 'spinner advances')
    capture('spinner-next')
    clock = re.search(r'\d+s', first).group()
    wait(lambda: (row := activity_row(screen())) and re.search(r'\d+s', row).group() != clock, 'elapsed time advances')
    capture('clock-advanced')
    send('/calm')
    wait(lambda: 'Calm off for this session.' in screen(), 'Calm disabled')
    off = capture('active-off', pages=True)
    assert 'HOLD_PARTIAL_a' in off and 'HOLD_PARTIAL_b' in off
    send('/calm')
    wait(lambda: bool(re.fullmatch(parallel, activity_row(screen()))), 'Calm enabled')
    (run / 'release').write_text('release')
    wait(lambda: any(event.get('gate') == 'after-parallel' for event in events()), 'parallel tools completed')
    wait(lambda: 'last probe_hold' in activity_row(screen()), 'last completed parallel call retained')
    capture('parallel-completed')
    thinking = count('thinking-start')
    (run / 'after-parallel').write_text('release')
    wait(lambda: count('thinking-start') > thinking, 'model continues thinking after tools')
    retained = capture('retained-during-thinking')
    assert re.fullmatch(rf'{SPINNER} Thinking   \d+s · 1 failed · last probe_hold', activity_row(retained))
    passed.append('last completed parallel call stays visible during subsequent model thinking')
    wait(lambda: count('settled') == 1, 'turn settled')
    wait(lambda: 'CALM_FINAL' in screen(), 'final reply')
    idle = capture('idle')
    assert activity_row(idle) == ''
    event_command('/calm-probe assert-file', 'file-checked')
    passed.append('live toggling restores partial results, real edit succeeds, and the rail disappears at idle')
    send('fixture-stream')
    wait(lambda: 'STREAM_FLAG_LIVE' in screen(), 'streaming formatter state')
    streaming = capture('streaming')
    assert re.fullmatch(rf'{SPINNER} Responding \d+s', activity_row(streaming)), 'a turn without tools shows meaningful activity'
    assert re.search(r'\d', activity_row(streaming)).start() == 13, 'responding keeps the clock in column fourteen'
    wait(lambda: count('settled') == 2, 'stream settled')
    send('fixture-truncated')
    wait(lambda: count('settled') == 3, 'truncated turn settled')
    wait(lambda: 'Response was truncated before completion.' in screen(), 'native truncation notice')
    capture('truncated')
    send('/calm-probe notice')
    wait(lambda: 'VISIBLE_NATIVE_NOTICE' in screen(), 'native notice')
    capture('notice')
    passed.append('streaming metadata and native notices survive filtering')
    send('/calm-probe prompt')
    wait(lambda: 'INPUT_PROBE' in screen(), 'input prompt')
    prompt = capture('prompt')
    assert re.fullmatch(r'\? Waiting    \d+s · for input', activity_row(prompt)), 'input prompt pauses the spinner and names the wait'
    assert re.search(r'\d', activity_row(prompt)).start() == 13, 'waiting keeps the clock in column fourteen'
    before = count('prompt-ended')
    tmux('send-keys', '-t', 'probe', 'Enter')
    wait(lambda: count('prompt-ended') > before, 'input prompt completed')
    if args.pstack:
        event_command('/calm-probe seed-overlay', 'overlay-seeded')
        before = count('ready')
        send('/reload')
        wait(lambda: count('ready') > before, 'saved child loaded without executing it')
        wait(lambda: 'Reloaded keybindings' in screen(), 'reload completed')
        send('/subagents')
        wait(lambda: 'OVERLAY_TOOL_RESULT' in screen(), 'unfiltered real PStack overlay')
        overlay = capture('pstack-overlay')
        assert 'OVERLAY_FINAL' in overlay
        tmux('send-keys', '-t', 'probe', 'Escape')
        wait(lambda: 'OVERLAY_TOOL_RESULT' not in screen(), 'overlay closed')
        passed.append('real /subagents overlay retains tool results with Calm on, using a saved fixture and no child execution')
    send('/calm')
    wait(lambda: 'Calm off for this session.' in screen(), 'saved off choice')
    shutdown()
    launch()
    restored = capture('restored-off', pages=True)
    assert 'HOLD_RESULT_a' in restored
    send('/calm')
    wait(lambda: 'Calm on for this session.' in screen(), 'restored session toggled on')
    restored_on = capture('restored-on', pages=True)
    assert 'HOLD_RESULT_a' not in restored_on
    before = count('ready')
    send('/reload')
    wait(lambda: count('ready') > before, 'in-process reload')
    wait(lambda: 'Reloaded keybindings' in screen(), 'reload completed')
    reloaded = capture('reloaded', pages=True)
    assert 'HOLD_RESULT_a' not in reloaded
    assert 'Calm unavailable' not in reloaded
    passed.append('session preference survives restart and in-process reload')
    send('/calm default off')
    wait(lambda: (agent / 'calm-default').exists() and (agent / 'calm-default').read_text() == 'off\n', 'startup default saved')
    assert 'HOLD_RESULT_a' not in capture('default-change-current-session', pages=True)
    send('/calm-probe break')
    wait(lambda: 'Calm unavailable.' in screen(), 'native compatibility fallback')
    fallback = capture('fallback', pages=True)
    assert 'NATIVE_FALLBACK_VISIBLE' in fallback
    assert 'HOLD_RESULT_a' in fallback
    passed.append('incompatible private metadata restores native transcript without partial filtering')
    shutdown()
    launch('new-session.jsonl')
    new_session = capture('new-default-off')
    send('/calm')
    wait(lambda: 'Calm on for this session.' in screen(), 'new session starts with saved default off')
    before = count('settled')
    send('fixture-abort')
    wait(lambda: any(event['type'] == 'hold-start' and event['label'] == 'abort' for event in events()), 'abort fixture active')
    wait(lambda: bool(re.fullmatch(rf'{SPINNER} Running    \d+s · probe_hold', activity_row(screen()))), 'abort fixture rail')
    tmux('send-keys', '-t', 'probe', 'Escape')
    wait(lambda: count('settled') > before, 'aborted turn settled')
    wait(lambda: activity_row(screen()) == '', 'aborted rail cleared')
    capture('aborted')
    shutdown()
    passed.append('saved startup default applies to a new session, and abort clears active activity')
    rpc_log = run / 'rpc.log'
    before = count('settled')
    env = {**os.environ, 'PI_CODING_AGENT_DIR': str(agent), 'PI_OFFLINE': '1', 'CALM_VERIFY_DIR': str(run)}
    with rpc_log.open('w') as output:
        rpc = subprocess.Popen([args.pi, '--offline', '--mode', 'rpc', '--session', str(run / 'rpc.jsonl'),
            '--no-skills', '--no-themes', '--no-context-files', '--no-prompt-templates',
            '-e', str(ROOT / 'tests/fixture.ts'), '--provider', 'calm-fixture', '--model', 'scripted'],
            cwd=run, env=env, stdin=subprocess.PIPE, stdout=output, stderr=output, text=True)
        try:
            rpc.stdin.write(json.dumps({'type': 'prompt', 'message': 'fixture-stream'}) + '\n')
            rpc.stdin.flush()
            wait(lambda: count('settled') > before, 'headless RPC turn settled')
            rpc.stdin.write(json.dumps({'type': 'prompt', 'message': '/calm-probe exit'}) + '\n')
            rpc.stdin.flush()
            assert rpc.wait(timeout=15) == 0
        finally:
            if rpc.poll() is None:
                rpc.terminate()
                rpc.wait(timeout=10)
            rpc.stdin.close()
    rpc_entries = [json.loads(line) for line in (run / 'rpc.jsonl').read_text().splitlines()]
    assert not any(entry.get('customType') == 'pi-calm-preference' for entry in rpc_entries)
    assert 'Calm unavailable' not in rpc_log.read_text()
    assert 'STREAM_FINAL' in rpc_log.read_text()
    passed.append('headless RPC executes normally without installing the projection or recording a Calm preference')
    stored = [json.loads(line) for line in (run / 'parent.jsonl').read_text().splitlines()]
    messages = [entry['message'] for entry in stored if entry['type'] == 'message']
    results = [message for message in messages if message['role'] == 'toolResult']
    assert len(results) == 5
    assert sum(message['isError'] for message in results) == 1
    assert any(part['type'] == 'thinking' for message in messages if message['role'] == 'assistant' for part in message['content'])
    passed.append('canonical session keeps all five tool results, the failure, and thinking')
    (run / 'results.json').write_text(json.dumps({'mode': args.mode, 'passed': passed}, indent=2) + '\n')
    print(json.dumps({'mode': args.mode, 'passed': passed}, indent=2), flush=True)
finally:
    try:
        (run / 'last-screen.txt').write_text(screen())
        tmux('kill-session', '-t', 'probe')
    except subprocess.CalledProcessError:
        pass
    try:
        tmux('kill-server')
    except subprocess.CalledProcessError:
        pass
