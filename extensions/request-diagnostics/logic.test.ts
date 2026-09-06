import assert from "node:assert/strict";
import test from "node:test";
import { createKeyedHasher, compareRequests, fingerprintPayload, safeHeaderHashes, safeTransportDiagnostics, stableStringify } from "./logic.ts";

test("canonical hashing is stable and does not expose input values", () => {
	const hash = createKeyedHasher(Buffer.from("synthetic-diagnostic-key"));
	const first = { z: 1, a: { second: "input secret", first: true } };
	const second = { a: { first: true, second: "input secret" }, z: 1 };
	assert.equal(stableStringify(first), stableStringify(second));
	const digest = hash("test", "input secret");
	assert.match(digest, /^[a-f0-9]{64}$/);
	assert.ok(!digest.includes("input secret"));
});

test("fingerprinting preserves ordered item identity without mutating payloads", () => {
	const hash = createKeyedHasher(Buffer.from("synthetic-diagnostic-key"));
	const payload = {
		model: "gpt-6-astra",
		input: [{ role: "user", content: [{ type: "input_text", text: "private prompt" }] }, { role: "assistant", content: [] }],
		prompt_cache_key: "private-session",
		stream: true,
	};
	const before = structuredClone(payload);
	const fingerprint = fingerprintPayload(payload, hash);
	assert.deepEqual(payload, before);
	assert.equal(fingerprint.inputItemHashes.length, 2);
	assert.notEqual(fingerprint.inputItemHashes[0], fingerprint.inputItemHashes[1]);
	assert.equal(fingerprint.cacheKeyHashes.prompt_cache_key, fingerprint.nonInputFieldHashes.prompt_cache_key);
	assert.ok(!JSON.stringify(fingerprint).includes("private prompt"));
	assert.ok(!JSON.stringify(fingerprint).includes("private-session"));
	assert.ok(!JSON.stringify(fingerprint).includes("gpt-6-astra"));
});

test("comparison separates append-only growth from the first changed item", () => {
	const hash = createKeyedHasher(Buffer.from("synthetic-diagnostic-key"));
	const base = fingerprintPayload({ model: "model", input: [{ n: 1 }, { n: 2 }], prompt_cache_key: "session" }, hash);
	const appended = fingerprintPayload({ model: "model", input: [{ n: 1 }, { n: 2 }, { n: 3 }], prompt_cache_key: "session" }, hash);
	const changed = fingerprintPayload({ model: "model", input: [{ n: 1 }, { n: 9 }, { n: 3 }], prompt_cache_key: "session" }, hash);
	const changedMetadata = fingerprintPayload({ model: "other", input: [{ n: 1 }, { n: 2 }], prompt_cache_key: "session" }, hash);

	assert.deepEqual(compareRequests(appended, base), {
		relation: "append_only",
		previousInputCount: 2,
		currentInputCount: 3,
		sharedPrefixCount: 2,
		earliestDivergence: null,
		appendedItemCount: 1,
		changedNonInputFields: [],
		cacheKeyMatch: true,
	});
	const divergence = compareRequests(changed, base);
	assert.equal(divergence.relation, "diverged");
	assert.equal(divergence.earliestDivergence, 1);
	assert.equal(divergence.sharedPrefixCount, 1);
	assert.equal(compareRequests(changedMetadata, base).changedNonInputFields.includes("model"), true);
});

test("header and transport diagnostics are allowlisted and redacted", () => {
	const hash = createKeyedHasher(Buffer.from("synthetic-diagnostic-key"));
	const headers = safeHeaderHashes(
		{
			"x-request-id": "request-secret",
			Authorization: "Bearer credential-secret",
			"content-type": "application/json",
		},
		hash,
	);
	assert.deepEqual(Object.keys(headers), ["content-type", "x-request-id"]);
	assert.ok(!JSON.stringify(headers).includes("request-secret"));
	assert.ok(!JSON.stringify(headers).includes("credential-secret"));

	assert.deepEqual(
		safeTransportDiagnostics([
			{ type: "provider_transport_failure", error: { message: "credential-secret" }, details: { configuredTransport: "auto", requestBytes: 42 } },
			{ type: "other", details: { secret: "do-not-log" } },
		]),
		[{ type: "provider_transport_failure", configuredTransport: "auto", requestBytes: 42 }],
	);
});

test("cyclic values fail closed instead of producing an ambiguous fingerprint", () => {
	const hash = createKeyedHasher(Buffer.from("synthetic-diagnostic-key"));
	const payload: { input?: unknown[] } = {};
	payload.input = [payload];
	assert.throws(() => fingerprintPayload(payload, hash), /cyclic/);
});
