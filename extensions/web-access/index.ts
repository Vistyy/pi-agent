import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";

import { WebAccessService, errorResult } from "./src/core.ts";

const SearchParams = Type.Object({
	query: Type.String({ minLength: 1, description: "One web search query." }),
}, { additionalProperties: false });

const FetchParams = Type.Union([
	Type.Object({
		url: Type.String({ minLength: 1, description: "Public HTTP(S) URL." }),
		question: Type.Optional(Type.String({ minLength: 1, description: "Focus highlights across the page on this question." })),
		maxChars: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 30_000 })),
	}, { additionalProperties: false }),
	Type.Object({
		contentRef: Type.String({ minLength: 1, description: "Reference returned by a truncated broad fetch." }),
		offset: Type.Integer({ minimum: 0, description: "Required zero-based Unicode character offset." }),
		maxChars: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 30_000 })),
	}, { additionalProperties: false }),
]);

export default function webAccessExtension(pi: ExtensionAPI) {
	const service = new WebAccessService();

	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: "Answer one current-information query with Exa and cited public sources; falls back once to compact search results.",
		promptSnippet: "Search the public web for one query with citations",
		promptGuidelines: ["Use web_search for current or externally sourced facts; pass one focused query."],
		parameters: SearchParams,
		async execute(_id, params, signal) {
			try { return await service.search(params.query, signal); }
			catch (error) { return errorResult(error); }
		},
		renderCall(args, theme) {
			return new Text(`${theme.fg("toolTitle", theme.bold("web_search "))}${theme.fg("muted", args.query)}`, 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as Record<string, unknown> | undefined;
			const backend = details?.backend ? ` · ${details.backend}` : "";
			const request = details?.requestId ? ` · ${details.requestId}` : "";
			return new Text(theme.fg("dim", `${result.content[0]?.type === "text" ? result.content[0].text : ""}${backend}${request}`), 0, 0);
		},
	});

	pi.registerTool({
		name: "web_fetch",
		label: "Web Fetch",
		description: "Fetch a public URL broadly, focus it by question, or continue a cached broad representation by contentRef and Unicode offset.",
		promptSnippet: "Fetch or continue public web content within an explicit character budget",
		promptGuidelines: ["Use web_fetch({url, question}) for selected evidence, {url} for broad text, and {contentRef, offset} only to continue a truncated broad result."],
		parameters: FetchParams,
		async execute(_id, params, signal) {
			try { return await service.webFetch(params, signal); }
			catch (error) { return errorResult(error); }
		},
		renderCall(args, theme) {
			const target = "url" in args ? args.url : `${args.contentRef} @ ${args.offset}`;
			return new Text(`${theme.fg("toolTitle", theme.bold("web_fetch "))}${theme.fg("muted", target)}`, 0, 0);
		},
	});

	pi.on("session_shutdown", () => service.clear());
}
