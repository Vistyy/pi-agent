import { COMPACTION_MARKER } from "./constants.js";
import type { OpenAIRemoteCheckpoint, ResponseItem } from "./types.js";

function compactionSummaryText(summary: string): string {
  return `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${summary}\n</summary>`;
}

const MARKER_TEXT = compactionSummaryText(COMPACTION_MARKER);

export function compactionSummaryItem(summary: string): ResponseItem {
  return {
    role: "user",
    content: [{ type: "input_text", text: compactionSummaryText(summary) }],
  };
}

function isMarkerItem(item: ResponseItem): boolean {
  if (item.role !== "user" || !Array.isArray(item.content)) return false;
  return item.content.some(
    (part) =>
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      part.type === "input_text" &&
      "text" in part &&
      part.text === MARKER_TEXT,
  );
}

export function replaceMarkerWithRemoteCheckpoint(
  input: readonly ResponseItem[],
  details: OpenAIRemoteCheckpoint,
): ResponseItem[] {
  const markerIndex = input.findIndex(isMarkerItem);
  if (markerIndex < 0) return [...input];
  return [
    ...input.slice(0, markerIndex),
    ...details.replacementHistory,
    ...input.slice(markerIndex + 1),
  ];
}

interface ToolInfo {
  name: string;
  description: string;
  parameters: unknown;
}

export function buildToolsPayload(
  allTools: readonly ToolInfo[],
  activeToolNames: readonly string[],
): Record<string, unknown>[] {
  const active = new Set(activeToolNames);
  return allTools
    .filter((tool) => active.has(tool.name))
    .map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
}

interface CompactionModel {
  id: string;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<string, string | null>>;
}

interface RemoteCompactionRequestSettings {
  model: CompactionModel;
  instructions: string;
  tools: Record<string, unknown>[];
  thinkingLevel: string;
  sessionId: string;
}

function reasoningFor(
  model: CompactionModel,
  thinkingLevel: string,
): Record<string, unknown> | undefined {
  if (!model.reasoning || thinkingLevel === "off") return undefined;
  const mapped = model.thinkingLevelMap?.[thinkingLevel];
  if (mapped === null) return undefined;
  return { effort: mapped ?? thinkingLevel, summary: "auto" };
}

export function buildRemoteCompactionRequest(
  settings: RemoteCompactionRequestSettings,
  input: readonly ResponseItem[],
): Record<string, unknown> {
  const reasoning = reasoningFor(settings.model, settings.thinkingLevel);
  return {
    model: settings.model.id,
    instructions: settings.instructions,
    input: [...input, { type: "compaction_trigger" }],
    tools: settings.tools,
    tool_choice: "auto",
    parallel_tool_calls: true,
    ...(reasoning ? { reasoning } : {}),
    text: { verbosity: "low" },
    prompt_cache_key: settings.sessionId,
    include: ["reasoning.encrypted_content"],
    store: false,
    stream: true,
  };
}

export function isCodexResponsesPayload(value: unknown): value is {
  model: string;
  input: ResponseItem[];
} & Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.model === "string" && Array.isArray(candidate.input);
}
