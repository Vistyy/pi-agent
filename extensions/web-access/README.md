# Web access

A local Pi extension for searching the public web and reading known public URLs. It intentionally exposes only two tools:

| Tool | Purpose |
| --- | --- |
| `web_search({query})` | Answer one focused query with cited public sources. |
| `web_fetch({url, question?, maxChars?})` | Read a URL broadly or select evidence for a question. |
| `web_fetch({contentRef, offset, maxChars?})` | Continue a truncated broad representation without another network request. |

Set `EXA_API_KEY` in the environment before using Exa-backed routes.

## Design choices

### Keep the agent-facing surface small

Search accepts one query rather than provider selection or automatic query fan-out. Fetch owns URL routing internally, so the agent does not need separate content, GitHub, or continuation tools.

### Prefer an answer, with one bounded fallback

`web_search` tries Exa Answer first and accepts it only when it has usable text and a public citation. A retryable or unusable answer triggers at most one compact Exa Search fallback. Authentication, payment, rate-limit, and cancellation failures remain explicit.

Search output is capped at 3,000 Unicode characters. Backend, cost, request, and fallback information stays in tool details instead of consuming model context.

### Use Exa for pages, direct retrieval for exact GitHub content

Focused ordinary-page fetches use fresh Exa highlights; broad fetches use fresh normalized text. Three GitHub forms bypass Exa:

- `raw.githubusercontent.com` returns direct source text;
- GitHub blob URLs are converted to raw content; and
- `api.github.com` returns public JSON, decoding base64 GitHub Contents payloads.

This preserves current source code and structured data without Exa extraction ambiguity, latency, or usage. Other GitHub pages still use Exa. Direct fetching remains restricted to recognized GitHub hosts and never sends GitHub credentials.

### Bound context without making broad content unreachable

Focused fetches default to 4,000 characters and are selected, non-exhaustive evidence. Broad fetches default to 6,000 characters. Callers may request 1,000–30,000 characters.

A truncated broad representation receives a session-only `contentRef`. Continuation uses zero-based Unicode code-point offsets and performs no network request. References live in a bounded LRU and expire on eviction or session shutdown. `complete` refers only to the stored normalized representation, not necessarily every source byte.

### Keep a narrow network boundary

Initial URLs must be public HTTP(S) URLs without embedded credentials. Local and private destinations are rejected before submission. Direct requests are limited to recognized GitHub hosts, revalidate redirects, reject binary content, and enforce timeout and response-size limits. Retrieved content is marked as untrusted web data.

## Validation

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
```

The default test suite is deterministic and makes no live network calls.
