/** Parse child Pi JSON-mode events into a compact fork result. */

import {
  MAX_INLINE_ERROR_PREVIEW_CHARS,
  MAX_TOOL_ARGS_PREVIEW_CHARS,
  extractResultText,
  formatCount,
  formatToolCallPreview,
  getSeenMessageSignatures,
  stableStringify,
  stringifyPreview,
  truncateInline,
} from "./event-format.js";

const MAX_STORED_ACTIVITIES = 25;

function updateAssistantMetadata(result, message) {
  if (!message || message.role !== "assistant") return;
  if (!result.provider && message.provider) result.provider = message.provider;
  if (!result.model && message.model) result.model = message.model;
  if (message.stopReason) result.stopReason = message.stopReason;
  if (message.errorMessage) result.errorMessage = message.errorMessage;
}

function sanitizeAssistantMessage(message) {
  const sanitized = { ...message };
  delete sanitized.thinking;
  delete sanitized.reasoning;
  delete sanitized.reasoning_content;

  if (Array.isArray(message.content)) {
    sanitized.content = message.content
      .filter((part) => part?.type !== "thinking")
      .map((part) => {
        if (!part || typeof part !== "object") return part;
        const cleanPart = { ...part };
        delete cleanPart.thinking;
        delete cleanPart.reasoning;
        delete cleanPart.reasoning_content;
        return cleanPart;
      });
  }

  return sanitized;
}

function addAssistantMessage(result, message) {
  if (!message || message.role !== "assistant") return false;

  const sanitized = sanitizeAssistantMessage(message);
  updateAssistantMetadata(result, sanitized);

  const signature = stableStringify(sanitized);
  const seen = getSeenMessageSignatures(result);
  if (seen.has(signature)) return false;
  seen.add(signature);

  result.messages.push(sanitized);

  result.usage.turns++;
  const usage = message.usage;
  if (usage) {
    result.usage.input += usage.input || 0;
    result.usage.output += usage.output || 0;
    result.usage.cacheRead += usage.cacheRead || 0;
    result.usage.cacheWrite += usage.cacheWrite || 0;
    result.usage.cost += usage.cost?.total || 0;
    result.usage.contextTokens = usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite || 0;
  }

  return true;
}

function addMessages(result, messages) {
  if (!Array.isArray(messages)) return false;
  let changed = false;
  for (const message of messages) {
    if (addAssistantMessage(result, message)) changed = true;
  }
  return changed;
}

function ensureRetryState(result) {
  if (!result.retry || typeof result.retry !== "object") result.retry = {};
  if (!Array.isArray(result.retry.history)) result.retry.history = [];
  return result.retry;
}

function processAutoRetryStart(event, result) {
  const retry = ensureRetryState(result);
  retry.active = true;
  retry.pending = false;
  retry.success = undefined;
  if (typeof event.attempt === "number") retry.attempt = event.attempt;
  if (typeof event.maxAttempts === "number") retry.maxAttempts = event.maxAttempts;
  if (typeof event.delayMs === "number") retry.delayMs = event.delayMs;
  if (typeof event.errorMessage === "string") retry.errorMessage = event.errorMessage;
  delete retry.finalError;
  retry.history.push({ type: "start", attempt: retry.attempt, maxAttempts: retry.maxAttempts, delayMs: retry.delayMs, errorMessage: retry.errorMessage });
  result.sawAgentEnd = false;
  return true;
}

function processAutoRetryEnd(event, result) {
  const retry = ensureRetryState(result);
  retry.active = false;
  retry.pending = false;
  retry.success = Boolean(event.success);
  if (typeof event.attempt === "number") retry.attempt = event.attempt;
  if (typeof event.finalError === "string") retry.finalError = event.finalError;
  retry.history.push({ type: "end", attempt: retry.attempt, success: retry.success, finalError: retry.finalError });
  if (!retry.success) {
    result.stopReason = "error";
    if (retry.finalError) result.errorMessage = retry.finalError;
  }
  return true;
}

function maxActivityOrder(result) {
  const activities = Array.isArray(result.activities) ? result.activities : [];
  let max = 0;
  for (const activity of activities) {
    if (typeof activity?.activityOrder === "number") max = Math.max(max, activity.activityOrder);
  }
  return max;
}

function nextActivityOrder(result) {
  if (!Object.prototype.hasOwnProperty.call(result, "__activityOrder")) {
    Object.defineProperty(result, "__activityOrder", { value: maxActivityOrder(result), enumerable: false, configurable: false, writable: true });
  }
  result.__activityOrder += 1;
  return result.__activityOrder;
}

function ensureActivities(result) {
  if (!Array.isArray(result.activities)) result.activities = [];
  return result.activities;
}

function addActivity(result, activity) {
  const activities = ensureActivities(result);
  const totalBefore = typeof result.activityCount === "number" ? result.activityCount : activities.length;
  result.activityCount = totalBefore + 1;
  activities.push(activity);
  while (activities.length > MAX_STORED_ACTIVITIES) activities.shift();
  return activity;
}

function latestActivity(result) {
  const activities = Array.isArray(result.activities) ? result.activities : [];
  return activities[activities.length - 1];
}

function estimateTokensFromChars(chars) {
  const safeChars = typeof chars === "number" && Number.isFinite(chars) && chars > 0 ? chars : 0;
  return safeChars > 0 ? Math.ceil(safeChars / 4) : 0;
}

function getThinkingChars(activity) {
  if (typeof activity?._thinkingChars === "number") return activity._thinkingChars;
  if (typeof activity?.tokens === "number") return activity.tokens * 4;
  return 0;
}

function setThinkingChars(activity, chars) {
  Object.defineProperty(activity, "_thinkingChars", { value: Math.max(0, chars), writable: true, configurable: true, enumerable: false });
  activity.tokens = estimateTokensFromChars(chars);
}

function latestRunningThinkingActivity(result) {
  const activities = Array.isArray(result.activities) ? result.activities : [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "thinking" && activity.status === "running") return activity;
  }
  return undefined;
}

function createThinkingActivity(result) {
  const activity = addActivity(result, { type: "thinking", status: "running", tokens: 0, activityOrder: nextActivityOrder(result) });
  setThinkingChars(activity, 0);
  return activity;
}

function ensureLatestThinkingActivity(result) {
  return latestRunningThinkingActivity(result) || createThinkingActivity(result);
}

function processMessageUpdateEvent(event, result) {
  const assistantEvent = event.assistantMessageEvent;
  if (!assistantEvent || typeof assistantEvent !== "object") return false;

  switch (assistantEvent.type) {
    case "thinking_start": {
      const currentLatest = latestActivity(result);
      const activity = currentLatest?.type === "thinking" && currentLatest.status === "running" ? currentLatest : createThinkingActivity(result);
      activity.status = "running";
      return true;
    }
    case "thinking_delta": {
      const activity = ensureLatestThinkingActivity(result);
      activity.status = "running";
      if (typeof assistantEvent.delta === "string") setThinkingChars(activity, getThinkingChars(activity) + assistantEvent.delta.length);
      return true;
    }
    case "thinking_end": {
      const activity = ensureLatestThinkingActivity(result);
      activity.status = "completed";
      if (typeof assistantEvent.content === "string") setThinkingChars(activity, assistantEvent.content.length);
      return true;
    }
    default:
      return false;
  }
}

function findToolActivity(result, toolCallId) {
  if (!toolCallId || !Array.isArray(result.activities)) return undefined;
  return result.activities.find((activity) => activity?.type === "tool" && activity.toolCallId === toolCallId);
}

function ensureToolActivity(result, event) {
  const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : `unknown-${nextActivityOrder(result)}`;
  let activity = findToolActivity(result, toolCallId);
  if (!activity) {
    activity = addActivity(result, {
      type: "tool",
      toolCallId,
      toolName: typeof event.toolName === "string" ? event.toolName : "tool",
      status: "running",
      updates: 0,
      activityOrder: nextActivityOrder(result),
    });
  }

  if (typeof event.toolName === "string") activity.toolName = event.toolName;
  if (Object.prototype.hasOwnProperty.call(event, "args")) {
    activity.argsPreview = stringifyPreview(event.args, MAX_TOOL_ARGS_PREVIEW_CHARS);
    activity.displayText = formatToolCallPreview(activity.toolName, event.args);
  }
  if (!activity.displayText) activity.displayText = activity.toolName;
  return activity;
}

function processToolExecutionEvent(event, result) {
  const activity = ensureToolActivity(result, event);

  switch (event.type) {
    case "tool_execution_start":
      activity.status = "running";
      activity.isError = false;
      activity.latestText = "";
      return true;
    case "tool_execution_update": {
      activity.status = "running";
      activity.isError = false;
      activity.updates = (activity.updates || 0) + 1;
      const latestText = extractResultText(event.partialResult);
      if (latestText) activity.latestText = latestText;
      return true;
    }
    case "tool_execution_end": {
      activity.status = event.isError ? "error" : "completed";
      activity.isError = Boolean(event.isError);
      const latestText = extractResultText(event.result);
      if (latestText) activity.latestText = latestText;
      return true;
    }
    default:
      return false;
  }
}

export function processPiEvent(event, result) {
  if (!event || typeof event !== "object") return false;

  switch (event.type) {
    case "message_update":
      return processMessageUpdateEvent(event, result);
    case "message_end":
      return addAssistantMessage(result, event.message);
    case "turn_end": {
      let changed = false;
      if (addAssistantMessage(result, event.message)) changed = true;
      if (addMessages(result, event.toolResults)) changed = true;
      return changed;
    }
    case "agent_end":
      result.sawAgentEnd = true;
      return addMessages(result, event.messages);
    case "auto_retry_start":
      return processAutoRetryStart(event, result);
    case "auto_retry_end":
      return processAutoRetryEnd(event, result);
    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
      return processToolExecutionEvent(event, result);
    default:
      return false;
  }
}

export function processPiJsonLine(line, result) {
  if (!line.trim()) return false;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return false;
  }
  return processPiEvent(event, result);
}

export function getFinalAssistantText(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part?.type === "text" && typeof part.text === "string" && part.text.length > 0) return part.text;
    }
  }
  return "";
}

function getLatestRelevantToolActivity(result) {
  const activities = Array.isArray(result?.activities) ? result.activities : [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "tool" && activity.status === "running") return activity;
  }
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "tool") return activity;
  }
  return undefined;
}

function formatToolStatusIcon(tool) {
  if (tool?.status === "running") return "…";
  if (tool?.status === "error") return "×";
  return "✓";
}

function formatToolErrorSuffix(tool) {
  if (tool?.status !== "error" && !tool?.isError) return "";
  if (typeof tool.latestText !== "string" || !tool.latestText.trim()) return "";
  return ` — ${truncateInline(tool.latestText, MAX_INLINE_ERROR_PREVIEW_CHARS)}`;
}

function getThinkingTokens(thinking) {
  return typeof thinking?.tokens === "number" ? thinking.tokens : 0;
}

function formatThinkingActivityProgress(thinking) {
  if (!thinking || typeof thinking !== "object") return "";
  const icon = thinking.status === "running" ? "…" : "✓";
  const tokens = getThinkingTokens(thinking);
  const label = tokens > 0 ? `thinking ~${formatCount(tokens)} tokens` : thinking.status === "running" ? "thinking..." : "thinking";
  return `${icon} ${label}`;
}

function formatActivityProgress(activity) {
  if (activity?.type === "thinking") return formatThinkingActivityProgress(activity);
  if (activity?.type === "tool") return `${formatToolStatusIcon(activity)} ${activity.displayText || activity.toolName || "tool"}${formatToolErrorSuffix(activity)}`;
  return "";
}

function getStoredActivities(result) {
  const activities = Array.isArray(result?.activities) ? result.activities : [];
  return activities.filter((activity) => activity && typeof activity === "object");
}

function totalActivities(result, storedActivities) {
  return typeof result?.activityCount === "number" ? Math.max(result.activityCount, storedActivities.length) : storedActivities.length;
}

function formatRetryProgress(retry) {
  if (!retry || typeof retry !== "object" || !retry.active) return "";
  const attempt = typeof retry.attempt === "number" ? retry.attempt : undefined;
  const maxAttempts = typeof retry.maxAttempts === "number" ? retry.maxAttempts : undefined;
  const attemptText = attempt && maxAttempts ? `attempt ${attempt}/${maxAttempts}` : attempt ? `attempt ${attempt}` : "retrying";
  const delayText = typeof retry.delayMs === "number" && retry.delayMs > 0 ? `, waiting ${Math.round(retry.delayMs / 1000)}s` : "";
  const errorText = typeof retry.errorMessage === "string" && retry.errorMessage.trim() ? ` after ${truncateInline(retry.errorMessage.trim(), MAX_INLINE_ERROR_PREVIEW_CHARS)}` : "";
  return `Retrying${errorText} (${attemptText}${delayText})`;
}

function formatActivityProgressList(result) {
  const storedActivities = getStoredActivities(result);
  const lines = [];
  const toShow = storedActivities.slice(-10);
  const skipped = Math.max(0, totalActivities(result, storedActivities) - toShow.length);
  if (skipped > 0) lines.push(`... ${skipped} earlier activit${skipped === 1 ? "y" : "ies"}`);
  for (const activity of toShow) {
    const line = formatActivityProgress(activity);
    if (line) lines.push(line);
  }
  return lines.join("\n").trim();
}

export function getForkProgressText(result) {
  const retryProgress = formatRetryProgress(result?.retry);
  if (retryProgress) return retryProgress;

  const finalText = getFinalAssistantText(result?.messages);
  if (finalText) return finalText;

  const activityProgress = formatActivityProgressList(result);
  if (activityProgress) return activityProgress;

  const latestTool = getLatestRelevantToolActivity(result);
  if (latestTool) return formatActivityProgress(latestTool);

  if (typeof result?.errorMessage === "string" && result.errorMessage.trim()) return result.errorMessage.trim();
  return "(running...)";
}

export function getResultSummaryText(result) {
  const finalText = getFinalAssistantText(result?.messages);
  if (finalText) return finalText;
  if (typeof result?.errorMessage === "string" && result.errorMessage.trim()) return result.errorMessage.trim();
  const isError = (typeof result?.exitCode === "number" && result.exitCode > 0) || result?.stopReason === "error" || result?.stopReason === "aborted";
  if (isError && typeof result?.stderr === "string" && result.stderr.trim()) return result.stderr.trim();
  return "(no output)";
}
