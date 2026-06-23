import { FETCH_MAX_CHARS_DEFAULT } from "./constants.ts";

export function htmlDecode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function truncate(text: string, maxChars = FETCH_MAX_CHARS_DEFAULT) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n\n[Truncated: ${text.length - maxChars} chars omitted. Use web_content_get for more.]`;
}

export function summarizeText(text: string, question?: string, maxChars = FETCH_MAX_CHARS_DEFAULT) {
  // Deterministic compression: lead + lines containing query terms. No extra model call/cost.
  if (!question) return truncate(text, maxChars);
  const terms = question.toLowerCase().split(/\W+/).filter((t) => t.length > 3).slice(0, 12);
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const scored = paras.map((p) => ({ p, score: terms.reduce((n, t) => n + (p.toLowerCase().includes(t) ? 1 : 0), 0) }));
  const chosen = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map((x) => x.p);
  return truncate((chosen.length ? chosen : paras.slice(0, 8)).join("\n\n"), maxChars);
}
