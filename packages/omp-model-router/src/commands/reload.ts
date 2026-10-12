import type { ExtensionContext } from "@tau/tau-agent";
import type { RouterState } from "../state";
import type { Actions } from "./shared";
import { profileNames } from "../config";

export const handleReload = (
	state: RouterState,
	actions: Actions,
) => async (_args: string[], ctx: ExtensionContext) => {
	actions.reloadConfig(ctx, { preserveDebug: true });
	await actions.ensureValidActiveRouterProfile(ctx);
	ctx.ui.notify(
		`Router config reloaded. Profiles: ${profileNames(state.currentConfig).join(", ")}`,
		"info",
	);
};
