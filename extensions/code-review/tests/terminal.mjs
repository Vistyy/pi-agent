export function terminalText(text) {
    return text.replace(/\s+/g, ' ');
}

export function reloadReady(text) {
    const view = terminalText(text);
    return view.includes('Reloaded keybindings, extensions, skills, prompts, themes, and context files')
        && !view.includes('Reloading keybindings');
}
