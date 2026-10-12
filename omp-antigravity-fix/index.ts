// Fixes false HTTP 429 RESOURCE_EXHAUSTED when using Google Antigravity (Cloud Code Assist) models in oh-my-pi (omp)
// Source: arifaydin16/omp-antigravity-fix-extension + oscs1024-pixel/omp-antigravity
export const name = "omp-antigravity-fix-extension"
export const title = "OMP Antigravity Fix Extension - Nemotron routing"
export const manifest = {
  "omp.extensions": ["antigravity"],
  provider_id: "antigravity",
  pricing_fallback: "flat-rate",
  skip_on_plain: true
}
export function shouldRetry(status: number, body: string){
  if(status===429 && body.includes("RESOURCE_EXHAUSTED") && body.includes("antigravity")){
    return { retry: true, reason: "false 429 - defensive skip + flat-rate fallback" }
  }
  return { retry: false }
}
