import type { Message } from "@earendil-works/pi-ai";
import type { ResponseItem } from "./types.js";

function safeId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return normalized || "msg_pi";
}

function textIdentity(signature: unknown): { id?: string; phase?: string } {
  if (typeof signature !== "string" || signature.length === 0) return {};
  if (!signature.startsWith("{")) return { id: safeId(signature) };
  try {
    const value = JSON.parse(signature) as Record<string, unknown>;
    return {
      ...(typeof value.id === "string" ? { id: safeId(value.id) } : {}),
      ...(value.phase === "commentary" || value.phase === "final_answer"
        ? { phase: value.phase }
        : {}),
    };
  } catch {
    return {};
  }
}

function userItem(message: Message): ResponseItem | undefined {
  if (message.role !== "user") return undefined;
  const content =
    typeof message.content === "string"
      ? [{ type: "input_text", text: message.content }]
      : message.content.map((part) =>
          part.type === "text"
            ? { type: "input_text", text: part.text }
            : {
                type: "input_image",
                detail: "auto",
                image_url: `data:${part.mimeType};base64,${part.data}`,
              },
        );
  return content.length > 0 ? { role: "user", content } : undefined;
}

function assistantItems(message: Message, targetModelId: string, index: number): ResponseItem[] {
  if (message.role !== "assistant") return [];
  if (message.stopReason === "error" || message.stopReason === "aborted") return [];
  const sameModel = message.provider === "openai-codex" && message.model === targetModelId;
  const items: ResponseItem[] = [];
  let textIndex = 0;

  for (const block of message.content) {
    if (block.type === "thinking") {
      if (!sameModel || typeof block.thinkingSignature !== "string") continue;
      try {
        const reasoning = JSON.parse(block.thinkingSignature) as Record<string, unknown>;
        if (reasoning.type === "reasoning") items.push(reasoning);
      } catch {
        // Invalid opaque reasoning is omitted instead of corrupting the request.
      }
      continue;
    }
    if (block.type === "text") {
      const identity = textIdentity(block.textSignature);
      const fallback = textIndex === 0 ? `msg_pi_${index}` : `msg_pi_${index}_${textIndex}`;
      textIndex += 1;
      items.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: block.text, annotations: [] }],
        status: "completed",
        id: identity.id ?? fallback,
        ...(identity.phase ? { phase: identity.phase } : {}),
      });
      continue;
    }
    if (block.type === "toolCall") {
      const [callId, itemId] = block.id.split("|");
      items.push({
        type: "function_call",
        ...(sameModel && itemId
          ? { id: safeId(itemId.startsWith("fc_") ? itemId : `fc_${itemId}`) }
          : {}),
        call_id: safeId(callId),
        name: block.name,
        arguments: JSON.stringify(block.arguments),
      });
    }
  }
  return items;
}

function toolResultItem(message: Message): ResponseItem | undefined {
  if (message.role !== "toolResult") return undefined;
  const [callId] = message.toolCallId.split("|");
  const text = message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  return {
    type: "function_call_output",
    call_id: safeId(callId),
    output: text || (message.content.some((part) => part.type === "image") ? "(see attached image)" : "(no tool output)"),
  };
}

export function convertCodexMessages(
  targetModelId: string,
  messages: readonly Message[],
): ResponseItem[] {
  const input: ResponseItem[] = [];
  messages.forEach((message, index) => {
    const user = userItem(message);
    if (user) input.push(user);
    input.push(...assistantItems(message, targetModelId, index));
    const toolResult = toolResultItem(message);
    if (toolResult) input.push(toolResult);
  });
  return input;
}
