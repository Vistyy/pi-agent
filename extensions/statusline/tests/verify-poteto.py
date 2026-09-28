import argparse
import json
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--pstack', type=Path, required=True)
parser.add_argument('--calm', type=Path)
parser.add_argument('--theme', type=Path)
parser.add_argument('--mode', choices=['fullscreen', 'regular'], default='fullscreen')
args = parser.parse_args()
pi = shutil.which('pi')
assert pi, 'An installed Pi CLI is required.'
run = Path(tempfile.mkdtemp(prefix='pi-poteto-indicator-'))
agent = run / 'agent'
agent.mkdir()
settings = {'quietStartup': True, 'retry': {'enabled': False}, 'compaction': {'enabled': False}}
if args.theme:
    theme = json.loads(args.theme.read_text())
    (agent / 'themes').mkdir()
    (agent / 'themes' / f'{theme["name"]}.json').write_text(json.dumps(theme))
    settings['theme'] = theme['name']
(agent / 'settings.json').write_text(json.dumps(settings))
socket = run.name
print(f'Evidence {run}', flush=True)


def tmux(*words):
    return subprocess.check_output(['tmux', '-L', socket, *words], text=True, stderr=subprocess.PIPE)


def events():
    path = run / 'events.jsonl'
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def count(kind):
    return sum(event['type'] == kind for event in events())


def wait(predicate, label):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise RuntimeError(f'Timed out waiting for {label}')


def send(text):
    tmux('send-keys', '-t', 'probe', 'C-u')
    tmux('send-keys', '-l', '-t', 'probe', text)
    wait(lambda: any(line.strip() == text for line in tmux('capture-pane', '-p', '-t', 'probe').splitlines()), 'editor input')
    tmux('send-keys', '-t', 'probe', 'Enter')


def command(text, event_type):
    before = count(event_type)
    send(text)
    wait(lambda: count(event_type) > before, text)


def foreground(text):
    colors = re.findall(r'\x1b\[38;(?:2;\d+;\d+;\d+|5;\d+)m', text)
    return colors[-1] if colors else None


def footer():
    for line in reversed(tmux('capture-pane', '-e', '-p', '-t', 'probe').splitlines()):
        plain = re.sub(r'\x1b\[[0-9;]*m', '', line)
        if plain.startswith('π scripted:low'):
            return line, plain
    return '', ''


def check(state, label):
    colors = next(event['colors'] for event in reversed(events()) if 'colors' in event)
    expected = foreground(colors[state])
    assert expected is not None and colors['on'] != colors['off']
    wait(lambda: foreground(footer()[0].split('π', 1)[0]) == expected, label)
    raw, plain = footer()
    assert 'poteto' not in plain.lower().split(), 'no additional mode label'
    (run / f'{label}-footer.txt').write_text(raw)
    (run / f'{label}-viewport.txt').write_text(tmux('capture-pane', '-p', '-t', 'probe'))
    passed.append(label)


def launch():
    argv = [pi, '--offline', '--approve', '--session', str(run / 'parent.jsonl'),
            '--no-extensions', '--no-skills', '--no-context-files', '--no-prompt-templates',
            '-e', str(ROOT / 'index.ts'), '-e', str(args.pstack.resolve() / 'extensions/index.ts'),
            '-e', str(ROOT / 'tests/poteto-fixture.ts'), '--provider', 'poteto-fixture',
            '--model', 'scripted', '--thinking', 'low', '--tui-mode', args.mode]
    if args.calm:
        argv += ['-e', str(args.calm.resolve())]
    env = {'PI_CODING_AGENT_DIR': str(agent), 'PI_OFFLINE': '1', 'POTETO_VERIFY_DIR': str(run)}
    invocation = 'exec env ' + ' '.join(shlex.quote(f'{key}={value}') for key, value in env.items()) + ' ' + shlex.join(argv)
    before = count('ready')
    tmux('new-session', '-d', '-s', 'probe', '-x', '160', '-y', '42', '-c', str(run), invocation)
    tmux('set-option', '-t', 'probe', 'remain-on-exit', 'on')
    wait(lambda: count('ready') > before, 'Pi startup')


def shutdown():
    send('/indicator-probe exit')
    wait(lambda: tmux('display-message', '-p', '-t', 'probe', '#{pane_dead}').strip() == '1', 'Pi exit')
    assert tmux('display-message', '-p', '-t', 'probe', '#{pane_dead_status}').strip() == '0'
    tmux('kill-session', '-t', 'probe')


passed = []
try:
    launch()
    check('off', 'new-session-default-off')
    command('seed', 'settled')
    send('/poteto-mode on')
    check('on', 'command-on')
    send('/poteto-mode off')
    check('off', 'command-off')
    command('/reload', 'ready')
    check('off', 'reload-off')
    send('/poteto-mode')
    check('on', 'bare-command-on')
    command('/reload', 'ready')
    check('on', 'reload-on')
    command('/indicator-probe unrelated', 'action')
    check('on', 'unrelated-entry-ignored')
    command('forkpoint', 'settled')
    send('/poteto-mode off')
    check('off', 'before-fork-off')
    command('/indicator-probe fork', 'action')
    check('on', 'fork-inherits-earlier-on-state')
    command('/indicator-probe restore', 'action')
    check('off', 'restore-parent-off')
    command('/indicator-probe branch-on', 'action')
    check('on', 'tree-navigation-on')
    command('/indicator-probe branch-off', 'action')
    check('off', 'tree-navigation-off')
    send('/poteto-mode on')
    check('on', 'before-malformed-on')
    command('/indicator-probe invalid', 'action')
    check('off', 'malformed-newest-entry-means-off')
    send('/poteto-mode on')
    check('on', 'valid-entry-restores-on')
    command('/indicator-probe theme', 'action')
    check('on', 'live-theme-on')
    send('/poteto-mode off')
    check('off', 'live-theme-off')
    for width in [40, 80, 160]:
        tmux('resize-window', '-t', 'probe', '-x', str(width), '-y', '42')
        check('off', f'narrow-footer-{width}')
    shutdown()
    launch()
    check('off', 'restart-restores-off')
    send('/poteto-mode on')
    check('on', 'before-restart-on')
    shutdown()
    launch()
    check('on', 'restart-restores-on')
    command('/indicator-probe new', 'action')
    check('off', 'new-session-clears-on-state')
    shutdown()
    result = {'mode': args.mode, 'passed': passed}
    (run / 'results.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
except BaseException:
    try:
        (run / 'failure.txt').write_text(tmux('capture-pane', '-p', '-t', 'probe'))
    except subprocess.CalledProcessError:
        pass
    raise
finally:
    try:
        tmux('kill-server')
    except subprocess.CalledProcessError:
        pass
