/**
 * Fix 1 — x-api-provider header derived from the model, not the route shape.
 *
 * Droid Core open models must send "fireworks" as the x-api-provider header.
 * Deriving it from the route shape instead of the model name made the factory
 * send "factory" for glm/kimi/deepseek/nemotron, which the upstream API
 * rejected with `400 Invalid x-api-provider`.
 *
 * Source: tapze/omp-provider-factory-droid #2
 */

export type HeaderMap = Record<string, string>;

/**
 * Resolve the upstream provider family a model id belongs to.
 *
 * The nemotron check is deliberately first: a nemotron model id that also
 * contains another family token (e.g. "nemotron-kimi") is a fireworks model,
 * not a glm one, and ordering decides that.
 */
export function upstreamProviderFor(model: string): string {
	if (model.includes("nemotron")) return "fireworks";
	if (model.includes("glm") || model.includes("kimi") || model.includes("deepseek")) {
		return "fireworks";
	}
	if (model.includes("minimax")) return "anthropic-compatible";
	return "factory";
}

/**
 * Rewrite the x-api-provider header in place for the given model.
 *
 * Mutates and returns the same map so callers can use it in a header chain.
 */
export function fixHeaders(model: string, headers: HeaderMap): HeaderMap {
	headers["x-api-provider"] = upstreamProviderFor(model);
	return headers;
}
