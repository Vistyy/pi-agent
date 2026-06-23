import { createHash, randomUUID } from "node:crypto";
import { MAX_STORED_CHARS, MAX_STORED_ITEMS } from "./constants.ts";
import type { StoredContent } from "./types.ts";

const CONTENT = new Map<string, StoredContent>();

function pruneStoredContent() {
  while (CONTENT.size > MAX_STORED_ITEMS) {
    const oldest = [...CONTENT.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) break;
    CONTENT.delete(oldest.id);
  }
  let total = [...CONTENT.values()].reduce((n, item) => n + item.text.length, 0);
  while (total > MAX_STORED_CHARS) {
    const oldest = [...CONTENT.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) break;
    CONTENT.delete(oldest.id);
    total -= oldest.text.length;
  }
}

export function storeContent(url: string, text: string, source: string, title?: string) {
  const id = "web_" + createHash("sha256").update(url + Date.now() + randomUUID()).digest("hex").slice(0, 10);
  CONTENT.set(id, { id, url, title, text, source, createdAt: Date.now() });
  pruneStoredContent();
  return id;
}

export function getStoredContent(id: string) {
  return CONTENT.get(id);
}

export function clearStoredContent() {
  CONTENT.clear();
}

export function storedContentCount() {
  return CONTENT.size;
}
