import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerHerdrFocusPolicy } from "./src/extension.js";

export default function herdrFocusPolicy(pi: ExtensionAPI) {
  registerHerdrFocusPolicy(pi);
}
