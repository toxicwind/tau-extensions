/**
 * Fix 2 — suppress the false HTTP 429 RESOURCE_EXHAUSTED on Antigravity.
 *
 * Google Antigravity (Cloud Code Assist) models return a 429 whose body says
 * RESOURCE_EXHAUSTED while the subscription is nowhere near a limit. Retrying
 * on it burns the whole turn on a rate limit that does not exist. The retry is
 * skipped and pricing falls back to flat-rate.
 *
 * All three conditions must hold — status, body token, and the antigravity
 * marker — so a genuine quota exhaustion from any other provider still retries
 * normally.
 *
 * Source: arifaydin16/omp-antigravity-fix-extension + oscs1024-pixel/omp-antigravity
 */

export interface RetryDecision {
	retry: boolean;
	reason: string;
}

export function shouldRetry(status: number, body: string): RetryDecision {
	if (status === 429 && body.includes("RESOURCE_EXHAUSTED") && body.includes("antigravity")) {
		return { retry: true, reason: "false 429 - defensive skip + flat-rate fallback" };
	}
	return { retry: false, reason: "not a false 429" };
}
