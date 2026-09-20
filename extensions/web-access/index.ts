import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";

import { WebAccessService, errorResult } from "./src/core.ts";

const SearchParams = Type.Object({
	query: Type.String({ minLength: 1, description: "One web search query." }),
}, { additionalProperties: false });

const FetchParams = Type.Object({
	url: Type.Optional(Type.String({ minLength: 1, description: "Public HTTP(S) URL for a new fetch." })),
	question: Type.Optional(Type.String({ minLength: 1, description: "Focus evidence across the page on this question." })),
	contentRef: Type.Optional(Type.String({ minLength: 1, description: "Reference returned by a truncated broad fetch." })),
	offset: Type.Optional(Type.Integer({ minimum: 0, description: "Required zero-based Unicode character offset for continuation." })),
	maxChars: Type.Optional(Type.Integer({ minimum: 1_000, maximum: 30_000 })),
}, { additionalProperties: false });

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
		renderResult(result, { expanded }, theme) {
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			const details = result.details as Record<string, unknown> | undefined;
			if (expanded) {
				const request = details?.requestId ? `request ${details.requestId}` : undefined;
				const cost = details?.cost !== undefined ? `cost ${JSON.stringify(details.cost)}` : undefined;
				const meta = [details?.backend, request, cost].filter(Boolean).join(" · ");
				return new Text(`${text}${meta ? `\n\n${theme.fg("dim", meta)}` : ""}`, 0, 0);
			}
			const fallback = details?.fallback ? " · fallback" : "";
			return new Text(theme.fg("dim", `${details?.backend ?? "web"}${fallback} · ${Array.from(text).length} chars`), 0, 0);
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
			const target = args.url ?? `${args.contentRef} @ ${args.offset}`;
			return new Text(`${theme.fg("toolTitle", theme.bold("web_fetch "))}${theme.fg("muted", target)}`, 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			const details = result.details as Record<string, any> | undefined;
			if (expanded) return new Text(text, 0, 0);
			const range = details?.range;
			const position = range ? ` · ${range.start}-${range.end}/${details.representationChars}` : "";
			const state = details?.complete ? " · complete" : details?.nextOffset !== undefined ? " · more" : "";
			return new Text(theme.fg("dim", `${details?.source ?? details?.mode ?? "web"}${position}${state}`), 0, 0);
		},
	});

	pi.on("session_shutdown", () => service.clear());
}
