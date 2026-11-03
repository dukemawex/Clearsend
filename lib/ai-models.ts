// Single source of truth for AI model defaults (agent chat, verifier, spec extraction). Free models only.
export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
export const NVIDIA_DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";
export const OPENROUTER_DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
export const OPENROUTER_DEFAULT_FALLBACKS = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free"];

type Env = Record<string, string | undefined>;
/** NVIDIA NIM model: NVIDIA_MODEL or the default. */
export function nvidiaModelId(env: Env = process.env): string { return env.NVIDIA_MODEL?.trim() || NVIDIA_DEFAULT_MODEL; }
/** Primary OpenRouter model: OPENROUTER_MODEL or the free default. */
export function openrouterModelId(env: Env = process.env): string { return env.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL; }
/** OpenRouter models to try in order: primary, then OPENROUTER_FALLBACK_MODELS (comma-separated) or the free defaults. De-duplicated. */
export function openrouterModelIds(env: Env = process.env): string[] {
  const fallbacks = env.OPENROUTER_FALLBACK_MODELS !== undefined ? env.OPENROUTER_FALLBACK_MODELS.split(",") : OPENROUTER_DEFAULT_FALLBACKS;
  return [...new Set([openrouterModelId(env), ...fallbacks].map((x) => x.trim()).filter(Boolean))];
}
