export const HERDR_FOCUS_BLOCK_MESSAGE =
  "Blocked agent-initiated Herdr focus change. Remove --focus and interact with the created pane, tab, workspace, or agent by ID. The user can focus it manually.";

const commandBoundary = "(?:^|[;&|()`\\n]\\s*)";
const commandEnd = "(?=\\s|$|[;&|()`])";
const simpleAssignment = "[A-Za-z_][A-Za-z0-9_]*=[^\\s;&|()]+\\s+";
const commandPrefix = [
  `(?:${simpleAssignment})`,
  "(?:(?:sudo|doas|command|builtin|time|nohup)(?:\\s+-\\S+)*\\s+)",
  "(?:env(?:\\s+(?:-\\S+|[A-Za-z_][A-Za-z0-9_]*=\\S+))*\\s+)",
].join("|");

const herdrCommand = new RegExp(
  `${commandBoundary}(?:(?:${commandPrefix})*)(?:\\S*/)?herdr${commandEnd}([^;&|()\\n]*)`,
  "g",
);

const focusSubcommand = /(?:^|\s)(?:workspace|tab|pane|agent)\s+focus(?=\s|$)|(?:^|\s)plugin\s+pane\s+focus(?=\s|$)/;

export function hasHerdrFocusChange(command: string): boolean {
  const normalized = command.replace(/\\\r?\n/g, " ");
  for (const match of normalized.matchAll(herdrCommand)) {
    const args = match[1] ?? "";
    if (/(?:^|\s)--focus(?=\s|$)/.test(args) || focusSubcommand.test(args)) return true;
  }
  return false;
}
