import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createProvider } from "./provider.js";
import { SearchSession } from "./search.js";

export default function (pi: ExtensionAPI): void {
  let session: SearchSession | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    session?.dispose();
    const searchSession = new SearchSession(pi, ctx.cwd, (message) => {
      if (session === searchSession) ctx.ui.notify(message, "error");
    });
    session = searchSession;
    void searchSession.warm("project");
    void searchSession.warm("global");
    ctx.ui.addAutocompleteProvider((current) => createProvider(pi, searchSession, current));
  });

  pi.on("session_shutdown", () => {
    session?.dispose();
    session = undefined;
  });
}
