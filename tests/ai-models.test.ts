import { test } from "node:test";
import assert from "node:assert/strict";
import { nvidiaModelId, openrouterModelId, openrouterModelIds, NVIDIA_DEFAULT_MODEL, OPENROUTER_DEFAULT_MODEL } from "../lib/ai-models";

test("defaults are the known-working free models", () => {
  assert.equal(NVIDIA_DEFAULT_MODEL, "meta/llama-3.3-70b-instruct");
  assert.equal(OPENROUTER_DEFAULT_MODEL, "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.equal(nvidiaModelId({}), "meta/llama-3.3-70b-instruct");
  assert.equal(openrouterModelId({}), "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.deepEqual(openrouterModelIds({}), ["nvidia/nemotron-3-ultra-550b-a55b:free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free"]);
  for (const id of openrouterModelIds({})) assert.match(id, /:free$/);
});

test("env overrides are honoured and de-duplicated", () => {
  assert.equal(nvidiaModelId({ NVIDIA_MODEL: "x/y" }), "x/y");
  assert.deepEqual(openrouterModelIds({ OPENROUTER_MODEL: "a:free", OPENROUTER_FALLBACK_MODELS: " b:free, a:free ," }), ["a:free", "b:free"]);
  assert.equal(openrouterModelId({ OPENROUTER_MODEL: "  " }), "nvidia/nemotron-3-ultra-550b-a55b:free");
});

test("no deprecated defaults remain in source", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["lib/agent.ts", "lib/verifier.ts", "lib/spec.ts"]) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /llama-3\.1-405b|llama-3\.1-8b/, f);
  }
});
