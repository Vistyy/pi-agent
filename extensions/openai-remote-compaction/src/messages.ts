import type { Message } from "@earendil-works/pi-ai";
import type { ResponseItem } from "./types.js";

export interface CodexConversionTarget {
  id: string;
  input?: readonly string[];
}

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

function userItem(message: Message, supportsImages: boolean): ResponseItem | undefined {
  if (message.role !== "user") return undefined;
  const sourceContent = message.content ?? [];
  if (typeof sourceContent === "string") {
    return { role: "user", content: [{ type: "input_text", text: sourceContent }] };
  }
  const content: ResponseItem[] = [];
  let omittedImage = false;
  for (const part of sourceContent) {
    if (part.type === "text") {
      content.push({ type: "input_text", text: part.text });
    } else if (supportsImages) {
      content.push({
        type: "input_image",
        detail: "auto",
        image_url: `data:${part.mimeType};base64,${part.data}`,
      });
    } else if (!omittedImage) {
      content.push({ type: "input_text", text: "(image omitted: model does not support images)" });
      omittedImage = true;
    }
  }
  return content.length > 0 ? { role: "user", content } : undefined;
}

function outputMessage(
  text: string,
  identity: { id?: string; phase?: string },
  fallbackId: string,
): ResponseItem {
  return {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text, annotations: [] }],
    status: "completed",
    id: identity.id ?? fallbackId,
    ...(identity.phase ? { phase: identity.phase } : {}),
  };
}

function assistantItems(
  message: Message,
  targetModelId: string,
  index: number,
): ResponseItem[] {
  if (message.role !== "assistant") return [];
  if (message.stopReason === "error" || message.stopReason === "aborted") return [];
  const sameModel = message.provider === "openai-codex" && message.model === targetModelId;
  const items: ResponseItem[] = [];
  let textIndex = 0;
  const fallbackId = () => {
    const id = textIndex === 0 ? `msg_pi_${index}` : `msg_pi_${index}_${textIndex}`;
    textIndex += 1;
    return id;
  };

  for (const block of message.content ?? []) {
    if (block.type === "thinking") {
      if (sameModel && typeof block.thinkingSignature === "string") {
        try {
          const reasoning = JSON.parse(block.thinkingSignature) as Record<string, unknown>;
          if (reasoning.type === "reasoning") items.push(reasoning);
        } catch {
          // Invalid opaque reasoning is omitted instead of corrupting the request.
        }
      } else if (!sameModel && block.thinking.trim()) {
        items.push(outputMessage(block.thinking, {}, fallbackId()));
      }
      continue;
    }
    if (block.type === "text") {
      const identity = sameModel ? textIdentity(block.textSignature) : {};
      items.push(outputMessage(block.text, identity, fallbackId()));
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

function toolResultItem(message: Message, supportsImages: boolean): ResponseItem | undefined {
  if (message.role !== "toolResult") return undefined;
  const [callId] = message.toolCallId.split("|");
  const content = message.content ?? [];
  const text = content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  const markedText = message.isError ? `[Tool error]\n${text || "(no tool output)"}` : text;
  const images = content.filter((part) => part.type === "image");
  let output: unknown;
  if (images.length > 0 && supportsImages) {
    output = [
      ...(markedText ? [{ type: "input_text", text: markedText }] : []),
      ...images.map((image) => ({
        type: "input_image",
        detail: "auto",
        image_url: `data:${image.mimeType};base64,${image.data}`,
      })),
    ];
  } else {
    const imageMarker = images.length > 0 ? "(tool image omitted: model does not support images)" : "";
    output = [markedText, imageMarker].filter(Boolean).join("\n") || "(no tool output)";
  }
  return { type: "function_call_output", call_id: safeId(callId), output };
}

export function convertCodexMessages(
  target: CodexConversionTarget,
  messages: readonly Message[],
): ResponseItem[] {
  const input: ResponseItem[] = [];
  const pendingToolCalls = new Set<string>();
  const supportsImages = target.input?.includes("image") ?? false;
  const closeOrphanedCalls = () => {
    for (const callId of pendingToolCalls) {
      input.push({
        type: "function_call_output",
        call_id: callId,
        output: "No result provided",
      });
    }
    pendingToolCalls.clear();
  };

  messages.forEach((message, index) => {
    if ((message.role === "user" || message.role === "assistant") && pendingToolCalls.size > 0) {
      closeOrphanedCalls();
    }
    const user = userItem(message, supportsImages);
    if (user) input.push(user);
    const assistant = assistantItems(message, target.id, index);
    input.push(...assistant);
    for (const item of assistant) {
      if (item.type === "function_call" && typeof item.call_id === "string") {
        pendingToolCalls.add(item.call_id);
      }
    }
    const toolResult = toolResultItem(message, supportsImages);
    if (toolResult) {
      pendingToolCalls.delete(toolResult.call_id as string);
      input.push(toolResult);
    }
  });
  closeOrphanedCalls();
  return input;
}
