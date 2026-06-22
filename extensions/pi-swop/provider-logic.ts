type StreamFunction = (...args: any[]) => any;

const SWOP_STREAM_MARK = Symbol.for("pi-swop.stream");

export interface OriginalStreamCache {
  current?: StreamFunction;
}

type MarkedStream = StreamFunction & { [SWOP_STREAM_MARK]?: true };

export function isSwopStream(fn: unknown): boolean {
  return typeof fn === "function" && Boolean((fn as MarkedStream)[SWOP_STREAM_MARK]);
}

export function markSwopStream<T extends StreamFunction>(fn: T): T {
  if (!isSwopStream(fn)) {
    Object.defineProperty(fn, SWOP_STREAM_MARK, {
      value: true,
      enumerable: false,
      configurable: false,
    });
  }
  return fn;
}

export function captureOriginalStream<T extends StreamFunction>(
  candidate: T | undefined,
  cache: OriginalStreamCache,
  setOriginalStream: (fn: T) => void,
): T {
  if (cache.current) {
    setOriginalStream(cache.current as T);
    return cache.current as T;
  }
  if (!candidate) {
    throw new Error("swop: openai-codex-responses provider not found. Is pi up to date?");
  }
  if (isSwopStream(candidate)) {
    throw new Error("swop: cannot capture pi-swop provider wrapper as original Codex stream");
  }
  cache.current = candidate;
  setOriginalStream(candidate);
  return candidate;
}
