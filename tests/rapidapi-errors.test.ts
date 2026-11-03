import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRapidApiError } from "../lib/flights";

test("429 includes quota headers and message", () => {
  const h = new Headers({ "x-ratelimit-requests-remaining": "0", "x-ratelimit-requests-limit": "20", "content-type": "application/json" });
  const m = describeRapidApiError(429, h, { message: "You have exceeded the MONTHLY quota" });
  assert.match(m, /HTTP 429 \(rate limit or quota exceeded\): You have exceeded the MONTHLY quota/);
  assert.match(m, /x-ratelimit-requests-limit=20, x-ratelimit-requests-remaining=0/);
  assert.doesNotMatch(m, /content-type/);
});

test("403 explains subscription and notes missing headers", () => {
  const m = describeRapidApiError(403, new Headers(), { message: "You are not subscribed to this API." });
  assert.equal(m, "RapidAPI HTTP 403 (key not subscribed to Sky-Scrapper): You are not subscribed to this API. [no rate-limit headers]");
});
