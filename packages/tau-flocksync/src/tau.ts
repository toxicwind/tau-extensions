import type { ExtensionAPI } from "tau/extensibility/extensions/types";
import { Input, matchesKey } from "@oh-my-pi/pi-tui";
import type { OmniPI } from "./contracts.ts";
import { createOmniExtension } from "./extension.ts";

export default async function (pi: ExtensionAPI): Promise<void> {
	await createOmniExtension(pi as unknown as OmniPI, {
		homeEnvVar: "PI_CODING_AGENT_DIR",
		defaultHome: "~/.tau/agent",
		inferenceApi: "openai-responses",
		matchesKey,
		createInput: (initialValue) => {
			const input = new Input();
			if (initialValue) input.handleInput(initialValue);
			return input;
		},
	});
}
