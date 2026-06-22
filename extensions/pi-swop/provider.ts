import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getApiProvider } from "@earendil-works/pi-ai";
import type {
  AssistantMessageEventStream,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { createRotatingStream, setOriginalCodexStream } from "./rotation";
import { PROVIDER } from "./types";
import {
  captureOriginalStream,
  markSwopStream,
  type OriginalStreamCache,
} from "./provider-logic";

type CodexStream = (
  model: Model<any>,
  context: any,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

const ORIGINAL_STREAM_KEY = Symbol.for("pi-swop.original-codex-stream");
type SwopGlobal = typeof globalThis & { [ORIGINAL_STREAM_KEY]?: OriginalStreamCache };

function getGlobalOriginalStreamCache(): OriginalStreamCache {
  const global = globalThis as SwopGlobal;
  global[ORIGINAL_STREAM_KEY] ??= {};
  return global[ORIGINAL_STREAM_KEY];
}

export function captureOriginalCodexStream(): CodexStream {
  const baseProvider = getApiProvider("openai-codex-responses");
  return captureOriginalStream(
    baseProvider?.streamSimple as CodexStream | undefined,
    getGlobalOriginalStreamCache(),
    setOriginalCodexStream,
  );
}

export function registerSwopProvider(pi: ExtensionAPI): void {
  captureOriginalCodexStream();
  pi.registerProvider(PROVIDER, {
    api: "openai-codex-responses",
    streamSimple: markSwopStream(createRotatingStream as CodexStream) as any,
  });
}

export function unregisterSwopProvider(pi: ExtensionAPI): void {
  pi.unregisterProvider(PROVIDER);
}
