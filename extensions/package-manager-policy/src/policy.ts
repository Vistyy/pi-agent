export type PolicyViolation = {
  readonly message: string;
};

type Policy = {
  readonly commandPattern: string;
  readonly message: string;
};

const commandBoundary = "(?:^|[;&|()`\\n]\\s*)";
const commandEnd = "(?=\\s|$|[;&|()`])";
const simpleAssignment = "[A-Za-z_][A-Za-z0-9_]*=[^\\s;&|()]+\\s+";
const commandPrefix = [
  `(?:${simpleAssignment})`,
  "(?:(?:sudo|doas|command|builtin|time)(?:\\s+-\\S+)*\\s+)",
  "(?:env(?:\\s+(?:-\\S+|[A-Za-z_][A-Za-z0-9_]*=\\S+))*\\s+)",
].join("|");

const policies: readonly Policy[] = [
  {
    commandPattern: "npm|npx",
    message:
      "Blocked npm/npx usage. Use pnpm instead. For npx, use pnpm dlx <package> or pnpm exec <command>.",
  },
  {
    commandPattern: "pip(?:3(?:\\.\\d+)?)?|pipx|virtualenv",
    message:
      "Blocked Python package/environment tool. Use uv instead. For pip, use uv pip or uv add. For pipx, use uvx. For virtualenv, use uv venv.",
  },
  {
    commandPattern: "python(?:3(?:\\.\\d+)?)?\\s+-m\\s+(?:pip|venv)",
    message:
      "Blocked python -m pip/venv. Use uv instead. For pip, use uv pip or uv add. For venv, use uv venv.",
  },
];

export function findPolicyViolation(command: string): PolicyViolation | undefined {
  const normalized = stripQuotedStringsCommentsAndHeredocs(command);

  return policies.find(({ commandPattern }) => {
    const pattern = new RegExp(
      `${commandBoundary}(?:(?:${commandPrefix})*)(?:\\S*/)?(?:${commandPattern})${commandEnd}`,
    );

    return pattern.test(normalized);
  });
}

function stripQuotedStringsCommentsAndHeredocs(command: string) {
  const withoutHeredocs = stripHeredocBodies(command);
  const executableSubcommands = extractCommandSubstitutions(withoutHeredocs);

  return [stripQuotedStringsAndComments(withoutHeredocs), ...executableSubcommands].join("\n");
}

function stripHeredocBodies(command: string) {
  const pendingDelimiters: string[] = [];

  return command
    .split("\n")
    .map((line) => {
      if (pendingDelimiters.length > 0) {
        if (line.trim() === pendingDelimiters[0]) {
          pendingDelimiters.shift();
        }
        return "";
      }

      pendingDelimiters.push(...findHeredocDelimiters(line));
      return line;
    })
    .join("\n");
}

function findHeredocDelimiters(line: string) {
  const delimiters: string[] = [];
  const heredoc = /<<(?!<)-?\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|()<>]+))/g;

  for (const match of line.matchAll(heredoc)) {
    const delimiter = match[1] ?? match[2] ?? match[3];
    if (delimiter) delimiters.push(delimiter.replace(/^\\/, ""));
  }

  return delimiters;
}

function extractCommandSubstitutions(command: string) {
  const subcommands: string[] = [];
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (quote === "'") {
      if (char === "'") quote = undefined;
      continue;
    }

    if (quote === '"') {
      if (!escaped && char === "\\") {
        escaped = true;
        continue;
      }

      if (!escaped && char === '"') {
        quote = undefined;
        continue;
      }

      escaped = false;
    }

    if (!quote && char === "'") {
      quote = "'";
      continue;
    }

    if (!quote && char === '"') {
      quote = '"';
      continue;
    }

    if (char === "$" && command[i + 1] === "(") {
      const extracted = extractParenthesized(command, i + 2);
      if (extracted) {
        subcommands.push(extracted.content);
        i = extracted.endIndex;
      }
      continue;
    }

    if (char === "`") {
      const extracted = extractBackticks(command, i + 1);
      if (extracted) {
        subcommands.push(extracted.content);
        i = extracted.endIndex;
      }
    }
  }

  return subcommands;
}

function extractParenthesized(command: string, startIndex: number) {
  let depth = 1;
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let i = startIndex; i < command.length; i += 1) {
    const char = command[i];

    if (quote) {
      if (quote === '"' && !escaped && char === "\\") {
        escaped = true;
        continue;
      }

      if (!escaped && char === quote) quote = undefined;
      escaped = false;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (depth === 0) {
      return { content: command.slice(startIndex, i), endIndex: i };
    }
  }

  return undefined;
}

function extractBackticks(command: string, startIndex: number) {
  let escaped = false;

  for (let i = startIndex; i < command.length; i += 1) {
    const char = command[i];

    if (!escaped && char === "\\") {
      escaped = true;
      continue;
    }

    if (!escaped && char === "`") {
      return { content: command.slice(startIndex, i), endIndex: i };
    }

    escaped = false;
  }

  return undefined;
}

function stripQuotedStringsAndComments(command: string) {
  let output = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (quote) {
      if (quote === '"' && !escaped && char === "\\") {
        escaped = true;
        output += " ";
        continue;
      }

      if (!escaped && char === quote) {
        quote = undefined;
      }

      escaped = false;
      output += char === "\n" ? "\n" : " ";
      continue;
    }

    if (char === "#" && (i === 0 || /\s/.test(command[i - 1]))) {
      while (i < command.length && command[i] !== "\n") {
        output += " ";
        i += 1;
      }
      if (i < command.length) output += "\n";
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      output += " ";
      continue;
    }

    output += char;
  }

  return output;
}
