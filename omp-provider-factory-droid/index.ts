// fix: x-api-provider derived from model not route shape
// Droid Core open models send "fireworks" instead of "factory", fixing 400 for glm/kimi/deepseek/nemotron
// Source: tapze/omp-provider-factory-droid #2
export const name = "omp-provider-factory-droid-nemotron-fix"
export const title = "OMP Provider Factory Droid - Nemotron 3 Super fix"
export function upstreamProviderFor(model: string){
  if(model.includes("nemotron")) return "fireworks"
  if(model.includes("glm") || model.includes("kimi") || model.includes("deepseek")) return "fireworks"
  if(model.includes("minimax")) return "anthropic-compatible"
  return "factory"
}
export function fixHeaders(model:string, headers: Record<string,string>){
  headers["x-api-provider"] = upstreamProviderFor(model)
  return headers
}
