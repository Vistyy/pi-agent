import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /(^|\s)(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|chgrp|ln|tee|truncate|dd|shred|install)(\s|$)/i,
  /(^|\s)(sudo|su|kill|pkill|killall|reboot|shutdown)(\s|$)/i,
  /(^|\s)(vim?|nano|emacs|code|subl)(\s|$)/i,
  /(^|\s)git\s+(add|commit|push|pull|fetch|merge|rebase|reset|checkout|switch|restore|clean|stash|cherry-pick|revert|tag|init|clone|apply|am)(\s|$)/i,
  /(^|\s)git\s+branch\s+-[dD](\s|$)/i,
  /(^|\s)(npm|pnpm|yarn)\s+(install|add|remove|uninstall|update|ci|link|publish)(\s|$)/i,
  /(^|\s)(pip|pip3)\s+(install|uninstall)(\s|$)/i,
  /(^|\s)(cargo|go)\s+(install|get|mod)(\s|$)/i,
  /(^|\s)apt(-get)?\s+(install|remove|purge|update|upgrade)(\s|$)/i,
  /(^|\s)brew\s+(install|uninstall|upgrade)(\s|$)/i,
  /(^|\s)systemctl\s+(start|stop|restart|enable|disable)(\s|$)/i,
  /(^|\s)service\s+\S+\s+(start|stop|restart)(\s|$)/i,
  /(^|[^<])>(?!>)/,
  /\d?>/,
  />>/,
  /\bfind\b.*\s-exec\b/i,
  /\bsed\s+-i\b/i,
  /\bawk\s+.*-i\b/i,
  /\|\s*(python|python3|perl|ruby|node|php|lua|bash|sh|zsh)(\s|$)/i,
  /\$\(.*\b(python|python3|perl|ruby|node|php|lua)\b/i,
  /`.*\b(python|python3|perl|ruby|node|php|lua)\b/i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\brsync\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
];

const SAFE_PATTERNS: RegExp[] = [
  /^\s*(cat|head|tail|less|more|grep|find|ls|pwd|echo|printf|wc|sort|uniq|diff|file|stat|du|df|tree)\b/i,
  /^\s*(which|whereis|type|printenv|uname|whoami|id|date|cal|uptime|ps|top|htop|free)\b/i,
  /^\s*git\s+(status|log|diff|show|branch|remote)(\s|$)/i,
  /^\s*git\s+config\s+--get(\s|$)/i,
  /^\s*git\s+ls-/i,
  /^\s*(npm|pnpm|yarn)\s+(list|ls|view|info|search|outdated|audit)(\s|$)/i,
  /^\s*node\s+--version(\s|$)/i,
  /^\s*(python|python3)\s+--version(\s|$)/i,
  /^\s*jq\b/i,
  /^\s*sed\s+-n\b/i,
  /^\s*(rg|fd|bat|eza)\b/i,
];

export function isSafeCommand(command: string): boolean {
  const isDestructive = DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
  const isSafe = SAFE_PATTERNS.some((pattern) => pattern.test(command));
  return !isDestructive && isSafe;
}

export default function (pi: ExtensionAPI): void {
  pi.on("tool_call", async (event) => {
    if (event.toolName === "edit" || event.toolName === "write") {
      return {
        block: true,
        reason: "Fork agent: file modification is not allowed.",
      };
    }

    if (event.toolName === "bash") {
      const command = typeof event.input?.command === "string" ? event.input.command : "";
      if (!isSafeCommand(command)) {
        return {
          block: true,
          reason: `Fork agent: bash is restricted to read-only inspection commands.\nCommand: ${command}`,
        };
      }
    }

    return undefined;
  });
}
