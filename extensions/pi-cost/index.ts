import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCostCommand } from "./src/commands/cost.js";

export default function costExtension(pi: ExtensionAPI) {
  registerCostCommand(pi);
}
