import type { ForkEffort } from "../core/types.js";
import { balancedPrompt, deepPrompt, fastPrompt } from "./prompts/index.js";

export interface ForkPromptOptions {
  writableTmpDir?: string;
}

function appendRuntimeNotes(prompt: string, options: ForkPromptOptions): string {
  if (!options.writableTmpDir) return prompt;
  return `${prompt}
Runtime note:
- If you need scratch files, downloads, clones, or quick experiments, use the writable temp directory: ${options.writableTmpDir}.
`;
}

export function buildForkTaskPrompt(
  task: string,
  effort: ForkEffort = "balanced",
  options: ForkPromptOptions = {},
): string {
  const prompt = effort === "fast"
    ? fastPrompt(task)
    : effort === "deep"
      ? deepPrompt(task)
      : balancedPrompt(task);
  return appendRuntimeNotes(prompt, options);
}
