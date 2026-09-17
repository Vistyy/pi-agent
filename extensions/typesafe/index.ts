import {
	createProvider,
	envApiKeyAuth,
	type Api,
	type ProviderStreams,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const TYPESAFE_PROVIDER_ID = "typesafe";
export const TYPESAFE_API_BASE_URL = "https://api.typesafe.ai";

/**
 * Register TypeSafe with Pi's credential system without advertising Jev as a
 * conversational model. TypeSafe consumers can resolve the stored key through
 * ctx.modelRegistry.getProviderAuth(TYPESAFE_PROVIDER_ID).
 */
export default function typesafeProvider(pi: ExtensionAPI): void {
	pi.registerProvider(
		createProvider({
			id: TYPESAFE_PROVIDER_ID,
			name: "TypeSafe",
			baseUrl: TYPESAFE_API_BASE_URL,
			auth: {
				apiKey: envApiKeyAuth("TypeSafe API key", ["TYPESAFE_API_KEY"]),
			},
			models: [],
			api: {} as Partial<Record<Api, ProviderStreams>>,
		}),
	);
}
