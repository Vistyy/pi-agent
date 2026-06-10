import type { ForkEffort } from "../core/types.js";
import { balancedPrompt, deepPrompt, fastPrompt } from "./prompts/index.js";

export function buildForkTaskPrompt(task: string, effort: ForkEffort = "balanced"): string {
  if (effort === "fast") return fastPrompt(task);
  if (effort === "deep") return deepPrompt(task);
  return balancedPrompt(task);
}
