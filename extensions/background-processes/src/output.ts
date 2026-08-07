import { randomBytes } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  truncateTail,
} from "@earendil-works/pi-coding-agent";

export const MAX_TEMP_OUTPUT_BYTES = 100 * 1024 * 1024;

export interface OutputSnapshot {
  readonly content: string;
  readonly truncation: ReturnType<typeof truncateTail> & {
    readonly truncated: boolean;
    readonly totalBytes: number;
    readonly totalLines: number;
    readonly maxBytes: number;
    readonly maxLines: number;
  };
  readonly fullOutputPath?: string;
  readonly fullOutputBytes?: number;
  readonly fullOutputCapped?: boolean;
  readonly fullOutputError?: string;
}

export interface OutputSnapshotOptions {
  readonly maxBytes?: number;
  readonly maxLines?: number;
  readonly persistIfTruncated?: boolean;
}

function temporaryOutputPath(): string {
  return join(tmpdir(), `pi-background-${randomBytes(8).toString("hex")}.log`);
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/**
 * Accumulates process output with Pi Bash-compatible display limits.
 *
 * Memory remains bounded to a rolling decoded tail.
 * When output exceeds Pi's normal tool limit, raw output is copied to a lazy
 * OS temporary file with an additional background-process disk cap.
 */
export class TaskOutput {
  private readonly decoder = new TextDecoder();
  private readonly rawChunks: Buffer[] = [];
  private tailText = "";
  private tailBytes = 0;
  private tailStartsAtLineBoundary = true;
  private totalRawBytes = 0;
  private totalDecodedBytes = 0;
  private completedLines = 0;
  private totalLines = 0;
  private currentLineBytes = 0;
  private hasOpenLine = false;
  private finished = false;
  private outputPath: string | undefined;
  private outputStream: WriteStream | undefined;
  private outputBytes = 0;
  private outputCapped = false;
  private outputError: string | undefined;

  append(data: Buffer): void {
    if (this.finished) return;

    this.totalRawBytes += data.length;
    this.appendDecodedText(this.decoder.decode(data, { stream: true }));

    if (this.outputStream) {
      this.writeToOutputFile(data);
      return;
    }

    if (data.length > 0) this.rawChunks.push(Buffer.from(data));
    if (this.shouldUseOutputFile()) this.ensureOutputFile();
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.appendDecodedText(this.decoder.decode());
    if (this.shouldUseOutputFile()) this.ensureOutputFile();
  }

  snapshot(options: OutputSnapshotOptions = {}): OutputSnapshot {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    const truncation = truncateTail(this.snapshotText(), { maxBytes, maxLines });
    const truncated = this.totalLines > maxLines || this.totalDecodedBytes > maxBytes;

    if (options.persistIfTruncated && truncated) this.ensureOutputFile();

    return {
      content: truncation.content,
      truncation: {
        ...truncation,
        truncated,
        totalBytes: this.totalDecodedBytes,
        totalLines: this.totalLines,
        maxBytes,
        maxLines,
      },
      ...(this.outputPath ? { fullOutputPath: this.outputPath } : {}),
      ...(this.outputPath ? { fullOutputBytes: this.outputBytes } : {}),
      ...(this.outputCapped ? { fullOutputCapped: true } : {}),
      ...(this.outputError ? { fullOutputError: this.outputError } : {}),
    };
  }

  async close(): Promise<void> {
    this.finish();
    const stream = this.outputStream;
    this.outputStream = undefined;
    if (!stream || stream.destroyed) return;

    await new Promise<void>((resolve) => {
      const finish = () => {
        stream.off("finish", finish);
        stream.off("close", finish);
        stream.off("error", finish);
        resolve();
      };
      stream.once("finish", finish);
      stream.once("close", finish);
      stream.once("error", finish);
      stream.end();
    });
  }

  async dispose(): Promise<void> {
    await this.close();
    if (!this.outputPath) return;
    await rm(this.outputPath, { force: true });
  }

  private appendDecodedText(text: string): void {
    if (!text) return;

    const bytes = utf8Bytes(text);
    this.totalDecodedBytes += bytes;
    this.tailText += text;
    this.tailBytes += bytes;
    if (this.tailBytes > DEFAULT_MAX_BYTES * 4) this.trimTail();

    let newlines = 0;
    let lastNewline = -1;
    for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
      newlines += 1;
      lastNewline = index;
    }

    if (newlines === 0) {
      this.currentLineBytes += bytes;
      this.hasOpenLine = true;
    } else {
      this.completedLines += newlines;
      const finalLine = text.slice(lastNewline + 1);
      this.currentLineBytes = utf8Bytes(finalLine);
      this.hasOpenLine = finalLine.length > 0;
    }
    this.totalLines = this.completedLines + (this.hasOpenLine ? 1 : 0);
  }

  private trimTail(): void {
    const buffer = Buffer.from(this.tailText, "utf8");
    const rollingBytes = DEFAULT_MAX_BYTES * 2;
    if (buffer.length <= rollingBytes) {
      this.tailBytes = buffer.length;
      return;
    }

    let start = buffer.length - rollingBytes;
    while (start < buffer.length && (buffer[start]! & 0xc0) === 0x80) start += 1;
    this.tailStartsAtLineBoundary =
      start === 0 ? this.tailStartsAtLineBoundary : buffer[start - 1] === 0x0a;
    this.tailText = buffer.subarray(start).toString("utf8");
    this.tailBytes = utf8Bytes(this.tailText);
  }

  private snapshotText(): string {
    if (this.tailStartsAtLineBoundary) return this.tailText;
    const firstNewline = this.tailText.indexOf("\n");
    return firstNewline === -1 ? this.tailText : this.tailText.slice(firstNewline + 1);
  }

  private shouldUseOutputFile(): boolean {
    return (
      this.totalRawBytes > DEFAULT_MAX_BYTES ||
      this.totalDecodedBytes > DEFAULT_MAX_BYTES ||
      this.totalLines > DEFAULT_MAX_LINES
    );
  }

  private ensureOutputFile(): void {
    if (this.outputPath) return;

    this.outputPath = temporaryOutputPath();
    const stream = createWriteStream(this.outputPath);
    this.outputStream = stream;
    stream.on("error", (error) => {
      this.outputError = error.message;
    });

    for (const chunk of this.rawChunks.splice(0)) this.writeToOutputFile(chunk);
  }

  private writeToOutputFile(data: Buffer): void {
    if (!this.outputStream || this.outputError || data.length === 0) return;

    const remaining = MAX_TEMP_OUTPUT_BYTES - this.outputBytes;
    if (remaining <= 0) {
      this.outputCapped = true;
      return;
    }

    const accepted = data.length <= remaining ? data : data.subarray(0, remaining);
    this.outputBytes += accepted.length;
    this.outputStream.write(accepted);
    if (accepted.length < data.length) this.outputCapped = true;
  }
}
