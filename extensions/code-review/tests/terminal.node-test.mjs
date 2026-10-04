import assert from 'node:assert/strict';
import test from 'node:test';
import { reloadReady, terminalText } from './terminal.mjs';

test('wrapped terminal text retains a readable scope question', () => {
    assert.equal(terminalText('Which services\n should be included\r\n in the review?'), 'Which services should be included in the review?');
});

test('wrapped reload success is ready', () => {
    assert.equal(reloadReady('Reloaded keybindings, extensions, skills,\n prompts, themes, and context\n files'), true);
});

test('previous success does not make a loading editor ready', () => {
    assert.equal(reloadReady('Reloaded keybindings, extensions, skills, prompts, themes, and context files\nReloading\n keybindings, extensions, skills, prompts, themes, and context files...'), false);
});

test('missing or failed reload output is not ready', () => {
    assert.equal(reloadReady(''), false);
    assert.equal(reloadReady('Reload failed: invalid configuration'), false);
});
