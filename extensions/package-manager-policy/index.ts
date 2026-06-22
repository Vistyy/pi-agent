import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPackageManagerPolicy } from "./src/extension.js";

export default function packageManagerPolicy(pi: ExtensionAPI) {
  registerPackageManagerPolicy(pi);
}
