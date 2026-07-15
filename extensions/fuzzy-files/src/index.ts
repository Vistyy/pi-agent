import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getEntries } from "./search.js";
import { createProvider } from "./provider.js";

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		void getEntries(pi, ctx.cwd, (message) => ctx.ui.notify(message, "error"));
		ctx.ui.addAutocompleteProvider((current) => createProvider(pi, ctx, current));
	});
}
