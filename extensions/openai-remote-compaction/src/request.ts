import { COMPACTION_MARKER } from "./constants.js";
import type {
  CodexRequestTemplate,
  OpenAIRemoteCompactionDetailsV1,
  ResponseItem,
} from "./types.js";

const MARKER_TEXT = `The conversation history before this point was compacted into the following summary:\n\n<summary>\n${COMPACTION_MARKER}\n</summary>`;

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
  details: OpenAIRemoteCompactionDetailsV1,
): ResponseItem[] {
  const markerIndex = input.findIndex(isMarkerItem);
  if (markerIndex < 0) return [...input];
  return [
    ...input.slice(0, markerIndex),
    ...details.replacementHistory,
    ...input.slice(markerIndex + 1),
  ];
}

export function captureContinuationSettings(
  template: CodexRequestTemplate,
): OpenAIRemoteCompactionDetailsV1["continuationSettings"] {
  return {
    ...(template.instructions !== undefined ? { instructions: template.instructions } : {}),
    ...(template.tools !== undefined ? { tools: template.tools } : {}),
    ...(template.reasoning !== undefined ? { reasoning: template.reasoning } : {}),
    ...(template.text !== undefined ? { text: template.text } : {}),
  };
}

export function buildRemoteCompactionRequest(
  template: CodexRequestTemplate,
  input: readonly ResponseItem[],
): Record<string, unknown> {
  return {
    model: template.model,
    ...(template.instructions !== undefined ? { instructions: template.instructions } : {}),
    input: [...input, { type: "compaction_trigger" }],
    ...(template.tools !== undefined ? { tools: template.tools } : {}),
    ...(template.tool_choice !== undefined ? { tool_choice: template.tool_choice } : {}),
    ...(template.parallel_tool_calls !== undefined
      ? { parallel_tool_calls: template.parallel_tool_calls }
      : {}),
    ...(template.reasoning !== undefined ? { reasoning: template.reasoning } : {}),
    ...(template.text !== undefined ? { text: template.text } : {}),
    ...(template.prompt_cache_key !== undefined
      ? { prompt_cache_key: template.prompt_cache_key }
      : {}),
    include: ["reasoning.encrypted_content"],
    store: false,
    stream: true,
  };
}

export function isCodexRequestTemplate(value: unknown): value is CodexRequestTemplate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.model === "string" && Array.isArray(candidate.input);
}
