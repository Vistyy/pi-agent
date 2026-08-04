import { randomUUID } from "node:crypto";
import { access, appendFile, mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import {
  type ExtensionAPI,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const INBOX_PATH = join(homedir(), ".pi", "agent", "papercuts", "inbox.jsonl");

type Papercut = {
  id: string;
  timestamp: string;
  sessionId: string | null;
  project: string;
  text: string;
};

export default function papercutsExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "record_papercut",
    label: "Record Papercut",
    description:
      "Record friction encountered during current work in the operator's global papercut inbox. Friction can be anything you find annoying, confusing, surprising, difficult, or poorly supported.",
    promptSnippet: "Record friction encountered during work without reading the papercut inbox",
    promptGuidelines: [
      "Use record_papercut when you encounter friction during current work that you judge worth recording. Record the observation and continue the assigned work. Do not read existing papercuts or divert from the assigned work to investigate, classify, or fix the papercut unless the user separately asks.",
    ],
    parameters: Type.Object({
      text: Type.String({
        minLength: 1,
        description: "A concise description of the friction you encountered",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const text = params.text.trim();
      if (!text) {
        throw new Error("Papercut text must not be empty.");
      }

      const papercut: Papercut = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        sessionId: ctx.sessionManager.getSessionId() ?? null,
        project: await findProject(ctx.cwd),
        text,
      };

      await withFileMutationQueue(INBOX_PATH, async () => {
        await mkdir(dirname(INBOX_PATH), { recursive: true });
        await appendFile(INBOX_PATH, `${JSON.stringify(papercut)}\n`, "utf8");
      });

      return {
        content: [{ type: "text", text: "Papercut recorded." }],
        details: { id: papercut.id },
      };
    },
  });
}

async function findProject(cwd: string): Promise<string> {
  const fallback = await canonicalPath(cwd);
  let current = fallback;
  const root = parse(current).root;

  while (true) {
    try {
      await access(join(current, ".git"));
      return current;
    } catch {
      if (current === root) return fallback;
      current = dirname(current);
    }
  }
}

async function canonicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch {
    return absolute;
  }
}
