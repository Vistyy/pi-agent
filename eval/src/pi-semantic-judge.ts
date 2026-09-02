import { readFile } from "node:fs/promises";
import path from "node:path";

import { ModelRuntime } from "@earendil-works/pi-coding-agent";

import type { SemanticJudge, SemanticJudgeRequest, SemanticJudgment } from "./grading.js";

interface JudgeModelConfiguration {
  provider: string;
  id: string;
  thinking_level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}

interface PiSemanticJudgeOptions {
  repositoryRoot: string;
  promptFile: string;
  promptRevision: string;
  model: JudgeModelConfiguration;
  timeoutMs?: number;
}

function responseText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((entry): entry is { type: "text"; text: string } =>
      Boolean(entry && typeof entry === "object" && (entry as { type?: unknown }).type === "text" && typeof (entry as { text?: unknown }).text === "string"),
    )
    .map((entry) => entry.text)
    .join("\n")
    .trim();
}

export function parseJudgeJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*)\n```$/u.exec(trimmed);
  const json = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(json) as unknown;
  } catch (error) {
    throw new Error(
      `Judge returned invalid JSON: ${error instanceof Error ? error.message : String(error)}; response=${JSON.stringify(trimmed)}`,
    );
  }
}

export class PiSemanticJudge implements SemanticJudge {
  readonly identity;

  private constructor(
    private readonly runtime: ModelRuntime,
    private readonly model: NonNullable<ReturnType<ModelRuntime["getModel"]>>,
    private readonly systemPrompt: string,
    private readonly timeoutMs: number,
    configuration: JudgeModelConfiguration,
    promptRevision: string,
  ) {
    this.identity = {
      id: "pi-json-semantic-judge",
      revision: "3",
      prompt_revision: promptRevision,
      model: {
        provider: configuration.provider,
        id: configuration.id,
        thinking_level: configuration.thinking_level,
      },
    };
  }

  static async create(options: PiSemanticJudgeOptions): Promise<PiSemanticJudge> {
    const repositoryRoot = path.resolve(options.repositoryRoot);
    const runtime = await ModelRuntime.create({
      authPath: path.join(repositoryRoot, "auth.json"),
      modelsPath: path.join(repositoryRoot, "models.json"),
      modelsStorePath: path.join(repositoryRoot, "models-store.json"),
    });
    const model = runtime.getModel(options.model.provider, options.model.id);
    if (!model) throw new Error(`Judge model not found: ${options.model.provider}/${options.model.id}`);
    if (!runtime.hasConfiguredAuth(options.model.provider)) {
      throw new Error(`Judge provider is not authenticated: ${options.model.provider}`);
    }
    const systemPrompt = (await readFile(options.promptFile, "utf8")).trim();
    if (!systemPrompt) throw new Error(`Judge prompt is empty: ${options.promptFile}`);
    return new PiSemanticJudge(
      runtime,
      model,
      systemPrompt,
      options.timeoutMs ?? 120_000,
      options.model,
      options.promptRevision,
    );
  }

  async judge(request: SemanticJudgeRequest): Promise<SemanticJudgment> {
    const response = await this.runtime.completeSimple(
      this.model,
      {
        systemPrompt: this.systemPrompt,
        messages: [
          {
            role: "user",
            content: JSON.stringify(request),
            timestamp: Date.now(),
          },
        ],
      },
      {
        reasoning: this.identity.model.thinking_level === "off" ? undefined : this.identity.model.thinking_level,
        temperature: 0,
        maxTokens: 8_000,
        timeoutMs: this.timeoutMs,
        maxRetries: 0,
      },
    );
    if (response.stopReason === "error" || response.stopReason === "aborted") {
      throw new Error(`Judge request failed: ${response.errorMessage ?? response.stopReason}`);
    }
    const text = responseText(response.content);
    if (!text) throw new Error("Judge returned no visible text.");
    return parseJudgeJson(text) as SemanticJudgment;
  }
}
