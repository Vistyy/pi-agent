export type SearchProvider = "auto" | "native" | "exa" | "ddg";
export type FetchMode = "markdown" | "summary" | "extract";

export interface StoredContent {
  id: string;
  url: string;
  title?: string;
  text: string;
  createdAt: number;
  source: string;
}

export interface FetchResult {
  title?: string;
  text: string;
  source: string;
}
