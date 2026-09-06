import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { appendFile, chmod, mkdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	compareRequests,
	createKeyedHasher,
	fingerprintPayload,
	safeHeaderHashes,
	safeTransportDiagnostics,
	type KeyedHasher,
	type RequestFingerprint,
} from "./logic.ts";

const ENV_ENABLED = "PI_REQUEST_DIAGNOSTICS";
const ENV_LOG = "PI_REQUEST_DIAGNOSTICS_LOG";
const ENV_KEY = "PI_REQUEST_DIAGNOSTICS_KEY";
const ENV_KEY_FILE = "PI_REQUEST_DIAGNOSTICS_KEY_FILE";
const LOG_FILE_NAME = "request-diagnostics.jsonl";
const KEY_FILE_NAME = "request-diagnostics.key";
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const ROTATION_SUFFIX = ".1";

interface PendingRequest {
	id: string;
	startedAt: number;
	fingerprint: RequestFingerprint;
	providerHash: string | null;
	modelHash: string | null;
}

type JsonRecord = Record<string, unknown>;

export default function requestDiagnostics(pi: ExtensionAPI): void {
	let enabled = process.env[ENV_ENABLED] === "1";
	let previousFingerprint: RequestFingerprint | undefined;
	let pendingRequest: PendingRequest | undefined;
	let sequence = 0;
	let writeQueue = Promise.resolve();
	let hash: KeyedHasher | undefined;

	pi.registerCommand("request-diagnostics", {
		description: "Enable or disable privacy-preserving provider request diagnostics",
		getArgumentCompletions: (prefix) => {
			const values = ["on", "off", "status"];
			return values.filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		handler: async (args, ctx) => {
			const choice = args.trim().toLowerCase();
			if (choice === "on") enabled = true;
			else if (choice === "off") enabled = false;
			else if (choice && choice !== "status") {
				ctx.ui.notify("Usage: /request-diagnostics [on|off|status]", "error");
				return;
			}
			ctx.ui.notify(`Request diagnostics ${enabled ? "on" : "off"}. Log: ${logPath()}`, "info");
			if (!enabled) await writeQueue;
		},
	});

	pi.on("session_start", () => {
		// Do not compare the first request of a replacement session with its predecessor.
		previousFingerprint = undefined;
		pendingRequest = undefined;
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!enabled) return;

		const h = getHash();
		let fingerprint: RequestFingerprint;
		try {
			fingerprint = fingerprintPayload(event.payload, h);
		} catch {
			queueLog({ kind: "request_unfingerprinted", sequence: ++sequence, reason: "payload_not_fingerprintable" });
			return;
		}
		const previous = previousFingerprint;
		previousFingerprint = fingerprint;
		const model = ctx.model;
		const providerHash = model ? h("identity:provider", model.provider) : null;
		const modelHash = model ? h("identity:model", model.id) : null;
		const request: PendingRequest = {
			id: randomUUID(),
			startedAt: Date.now(),
			fingerprint,
			providerHash,
			modelHash,
		};
		pendingRequest = request;
		queueLog({
			kind: "request",
			sequence: ++sequence,
			requestId: request.id,
			sessionIdHash: h("identity:session", ctx.sessionManager.getSessionId()),
			providerHash,
			modelHash,
			apiHash: model ? h("identity:api", model.api) : null,
			fingerprint: {
				inputKey: fingerprint.inputKey,
				inputItemCount: fingerprint.inputItemHashes.length,
				inputItemHashes: fingerprint.inputItemHashes,
				inputSequenceHash: fingerprint.inputSequenceHash,
				nonInputFieldHashes: fingerprint.nonInputFieldHashes,
				nonInputHash: fingerprint.nonInputHash,
				payloadHash: fingerprint.payloadHash,
				cacheKeyHashes: fingerprint.cacheKeyHashes,
			},
			comparison: previous ? compareRequests(fingerprint, previous) : null,
		});
	});

	pi.on("before_provider_headers", (event, ctx) => {
		if (!enabled) return;
		queueLog({
			kind: "request_headers",
			sequence: ++sequence,
			requestId: pendingRequest?.id ?? null,
			sessionIdHash: getHash()("identity:session", ctx.sessionManager.getSessionId()),
			headerHashes: safeHeaderHashes(event.headers, getHash()),
		});
	});

	pi.on("after_provider_response", (event, _ctx) => {
		if (!enabled) return;
		queueLog({
			kind: "response",
			sequence: ++sequence,
			requestId: pendingRequest?.id ?? null,
			status: event.status,
			latencyMs: pendingRequest ? Math.max(0, Date.now() - pendingRequest.startedAt) : null,
			headerHashes: safeHeaderHashes(event.headers, getHash()),
		});
	});

	pi.on("message_end", (event) => {
		if (!enabled || event.message.role !== "assistant") return;
		const message = event.message;
		const usage = message.usage;
		queueLog({
			kind: "usage",
			sequence: ++sequence,
			requestId: pendingRequest?.id ?? null,
			providerHash: getHash()("identity:provider", message.provider),
			modelHash: getHash()("identity:model", message.model),
			responseIdHash: message.responseId ? getHash()("identity:response", message.responseId) : null,
			stopReason: message.stopReason,
			usage: {
				input: usage.input,
				output: usage.output,
				cacheRead: usage.cacheRead,
				cacheWrite: usage.cacheWrite,
				totalTokens: usage.totalTokens,
			},
			transportDiagnostics: safeTransportDiagnostics(message.diagnostics),
		});
		pendingRequest = undefined;
	});

	pi.on("session_shutdown", async () => {
		await writeQueue;
	});

	function queueLog(record: JsonRecord): void {
		const line = `${JSON.stringify({ schema: 1, timestamp: new Date().toISOString(), ...record })}\n`;
		writeQueue = writeQueue
			.then(async () => {
				const path = logPath();
				await ensureLogDirectory(path);
				await rotateIfNeeded(path, Buffer.byteLength(line));
				await appendFile(path, line, { encoding: "utf8", mode: 0o600 });
				try {
					await chmod(path, 0o600);
				} catch {
					// Best effort only; the parent config directory is already private in normal installs.
				}
			})
			.catch(() => {
				// Diagnostics must never affect or block a provider request.
			});
	}

	function getHash(): KeyedHasher {
		return (hash ??= loadHasher());
	}

	function logPath(): string {
		const configured = process.env[ENV_LOG];
		if (configured) return isAbsolute(configured) ? configured : join(configDir(), configured);
		return join(configDir(), LOG_FILE_NAME);
	}

	function configDir(): string {
		return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
	}
}

function loadHasher(): KeyedHasher {
	const configured = process.env[ENV_KEY];
	if (configured) return createKeyedHasher(Buffer.from(configured, "utf8"));

	const keyPath = process.env[ENV_KEY_FILE] || join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), KEY_FILE_NAME);
	try {
		const existing = readFileSync(keyPath);
		if (existing.length > 0) return createKeyedHasher(existing);
	} catch {
		// Generate below when this is the first diagnostic request.
	}

	const generated = randomBytes(32);
	try {
		mkdirSyncCompat(keyPath);
		writeFileSync(keyPath, generated, { mode: 0o600, flag: "wx" });
		return createKeyedHasher(generated);
	} catch {
		try {
			const existing = readFileSync(keyPath);
			if (existing.length > 0) return createKeyedHasher(existing);
		} catch {
			// A process-local key preserves privacy if the config directory is unavailable.
		}
		return createKeyedHasher(generated);
	}
}

function mkdirSyncCompat(filePath: string): void {
	mkdirSync(dirname(filePath), { recursive: true });
}

async function ensureLogDirectory(filePath: string): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
}

async function rotateIfNeeded(filePath: string, incomingBytes: number): Promise<void> {
	try {
		const current = await stat(filePath);
		if (current.size + incomingBytes <= MAX_LOG_BYTES) return;
		const rotated = `${filePath}${ROTATION_SUFFIX}`;
		await unlink(rotated).catch(() => undefined);
		await rename(filePath, rotated);
	} catch {
		// Missing files and races are harmless; appendFile below remains the source of truth.
	}
}
