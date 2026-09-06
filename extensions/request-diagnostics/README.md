# Request diagnostics

This temporary global extension records privacy-preserving fingerprints of final provider payloads and response metadata to compare repeated cache misses, including Astra versus Luna.

It never records prompt text, tool arguments, reasoning contents, credentials, or the full request or response payload.

## Activation

The extension is auto-discovered from `~/.pi/agent/extensions/request-diagnostics/` in new Pi processes.

It is opt-in by default.

Start a diagnostic process with `PI_REQUEST_DIAGNOSTICS=1 pi`.

Use `PI_REQUEST_DIAGNOSTICS_LOG=/absolute/path/file.jsonl` to select a temporary log file.

The default log is `~/.pi/agent/request-diagnostics.jsonl` and is rotated at approximately 5 MiB to `request-diagnostics.jsonl.1`.

Use `/request-diagnostics on`, `/request-diagnostics off`, or `/request-diagnostics status` in a running session.

Turning it on in a running session does not require `/reload` because the extension is already loaded.

A new process or `/reload` is required after installing the extension file.

The extension does not change `settings.json`, `models.json`, provider registration, active tools, or request payloads.

It creates `request-diagnostics.key` with mode `0600` on first enabled request so the same HMAC hashes remain comparable across sessions.

Set `PI_REQUEST_DIAGNOSTICS_KEY` for a process-local or test key, or `PI_REQUEST_DIAGNOSTICS_KEY_FILE` for an alternate key file.

Keep the key private because it permits offline confirmation of whether two known values match.

## Bounded Astra/Luna comparison

Run each model in a fresh session and use a separate temporary log path.

For example, use `PI_REQUEST_DIAGNOSTICS=1 PI_REQUEST_DIAGNOSTICS_LOG=/tmp/pi-astra.jsonl pi --model openai-codex/gpt-6-astra --session /tmp/pi-astra-session.jsonl` and the corresponding `gpt-5.6-luna` and `/tmp/pi-luna.jsonl` values for the second run.

Coordinator-controlled normal calls can then compare the records with `jq -c 'select(.kind == "request" or .kind == "usage" or .kind == "response")' /tmp/pi-astra.jsonl` and the Luna path.

Compare `fingerprint.comparison.relation`, `earliestDivergence`, `sharedPrefixCount`, `changedNonInputFields`, `fingerprint.cacheKeyHashes`, response status, and usage cache counters.

`append_only` means the prior input sequence is an identical prefix and only normal new items were added.

`diverged` reports the zero-based first input item whose keyed hash changed or whose position changed.

Identical input hashes with different model/provider hashes and repeated `cacheRead: 0` responses support a provider/model-specific miss rather than an early-prefix mutation.

A changed non-input field is listed separately even when the input relationship is `append_only`.

Do not use this procedure to make paid calls without an explicit test decision.

## Log schema

Every line is JSON with `schema`, an ISO `timestamp`, `kind`, and a process-local `sequence` where applicable.

`request` includes an opaque `requestId`, keyed provider/model/API/session identity hashes, the detected input field name, input item count, ordered per-item HMAC hashes, an input-sequence hash, per-field HMAC hashes for every non-input field, a combined non-input hash, a payload summary hash, cache-key field hashes, and the comparison with the preceding request in the same session.

`request_headers` includes only HMACs of an allowlisted set of non-secret header values.

`response` includes the HTTP status, best-effort latency, and HMACs of allowlisted response headers.

`usage` includes the correlated response/model hashes, stop reason, token and cache counters, an HMAC of the provider response ID when available, and safe transport diagnostics.

Provider transport details are limited to the redacted diagnostic fields Pi exposes, such as configured/fallback transport, phase, whether stream events were emitted, and request byte count.

The extension uses asynchronous serialized file writes and suppresses logging failures so diagnostics cannot block or alter a request.

## Limitations

The provider hook exposes the final provider-specific payload after Pi converts custom messages to ordinary user messages, so this records what serialization produced rather than the pre-conversion session objects.

Pi does not expose a request ID to extension hooks, so response and usage association is best-effort and assumes normal sequential provider calls; retry response events can share the latest request ID.

Response headers and transport details depend on the provider and transport implementation.

The extension resets its previous-request comparison at session start, so comparisons never cross a replacement session.

Hashes are keyed rather than reversible, but an observer who obtains the key and guesses a value can confirm that value offline.

The log retains no plaintext labels for Astra or Luna; separate log paths or known model selections keep that comparison explicit without exposing model identity in the log.
