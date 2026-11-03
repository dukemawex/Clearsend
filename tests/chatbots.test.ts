import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTelegramSecret } from "../lib/chatbots/security";
import { confirmPhrase, parseCommand, parseInlineEscrow, parseQuote, parseRoleLink, phraseMatches, roleAllowed } from "../lib/chatbots/parse";

delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; delete process.env.VERCEL_ENV;
process.env.ESCROW_LINK_SECRET = "test-secret-for-unit-tests";



test("telegram secret check", () => {
  assert.equal(verifyTelegramSecret("abc_DEF-123", "abc_DEF-123"), true);
  assert.equal(verifyTelegramSecret("abc_DEF-124", "abc_DEF-123"), false);
  assert.equal(verifyTelegramSecret("abc", "abc_DEF-123"), false);
  assert.equal(verifyTelegramSecret(null, "abc"), false);
  assert.equal(verifyTelegramSecret("abc", undefined), false);
});

test("command parsing", () => {
  assert.deepEqual(parseCommand("/escrow@ClearSendBot 10 USD to A for b", "clearsendbot"), { cmd: "escrow", args: "10 USD to A for b" });
  assert.equal(parseCommand("/escrow@OtherBot x", "ClearSendBot"), null);
  assert.deepEqual(parseCommand("/help"), { cmd: "help", args: "" });
  assert.equal(parseCommand("hello"), null);
  assert.deepEqual(parseInlineEscrow("150 usd to Ada Obi <ada@example.com> for 3 logo concepts as PNG"), { amount: 150, currency: "USD", recipient: "Ada Obi", recipientEmail: "ada@example.com", specification: "3 logo concepts as PNG" });
  assert.equal(parseInlineEscrow("-5 USD to A for thing"), null);
  assert.equal(parseInlineEscrow("150 to Ada for x"), null);
  assert.deepEqual(parseQuote("100 USD to ngn"), { amount: 100, from: "USD", to: "NGN" });
  assert.equal(parseQuote("100 USD"), null);
  const tok = "a".repeat(64);
  assert.deepEqual(parseRoleLink(`https://x.app/escrow/escrow_1_abc?role=recipient&token=${tok}`), { escrowId: "escrow_1_abc", role: "recipient", token: tok });
  assert.equal(parseRoleLink(`https://x.app/escrow/escrow_1_abc?role=admin&token=${tok}`), null);
  assert.equal(confirmPhrase("release", 150, "usd"), "RELEASE 150.00 USD");
  assert.equal(phraseMatches(" release  150.00 usd ", "RELEASE 150.00 USD"), true);
  assert.equal(phraseMatches("RELEASE 15.00 USD", "RELEASE 150.00 USD"), false);
});

test("role policy: release only by payer", () => {
  assert.equal(roleAllowed("release", "payer"), true);
  assert.equal(roleAllowed("release", "verifier"), false);
  assert.equal(roleAllowed("release", "recipient"), false);
  assert.equal(roleAllowed("submit", "recipient"), true);
  assert.equal(roleAllowed("submit", "payer"), false);
  assert.equal(roleAllowed("fund", "recipient"), false);
  assert.equal(roleAllowed("refund", "verifier"), true);
  assert.equal(roleAllowed("verify", null), false);
});

test("guided create, invite join, role mapping and guards (memory store, no PayPal calls)", async () => {
  const core = await import("../lib/chatbots/core");
  const payer = { platform: "telegram" as const, chatId: "-100", userId: "1", userName: "@payer", isGroup: true };
  const rec = { ...payer, userId: "2", userName: "@rec" };
  const stranger = { ...payer, userId: "3", userName: "@x" };
  let r = await core.startCreate(payer, "150 USD to Ada <ada@example.com> for 3 logo concepts as PNG");
  assert.match(r.text, /country/i);
  r = await core.answerDraft(payer, "KE");
  assert.match(r.text, /PayPal email/i);
  r = await core.answerDraft(payer, "not-an-email");
  assert.match(r.text, /doesn't look like an email/);
  r = await core.answerDraft(payer, "payer@example.com");
  const id = /Escrow (escrow_\w+) created/.exec(r.text)?.[1];
  assert.ok(id, r.text);
  const code = /Recipient: .*\/join ([A-Za-z0-9_-]+)/.exec(r.text)?.[1];
  assert.ok(code);
  assert.equal(await core.getRole(id!, payer), "payer");
  assert.equal(await core.getRole(id!, rec), null);
  // payer can't take the recipient role too
  assert.match((await core.join(payer, code!)).text, /already hold the payer role/);
  assert.match((await core.join(rec, code!)).text, /joined .* as recipient/);
  assert.equal(await core.getRole(id!, rec), "recipient");
  // role already taken
  assert.match((await core.join(stranger, code!)).text, /already taken/);
  // guards
  assert.match((await core.fund(rec)).text, /Only the payer/);
  assert.match((await core.requestRelease(payer)).text, /needs an AI-verified escrow/);
  assert.match((await core.requestRelease(rec)).text, /Only the payer/);
  assert.match((await core.submit(rec, undefined, "done")).text, /only be submitted once it's funded/);
  assert.match((await core.status(stranger, id)).text, /Escrow escrow_/); // same chat -> visible
  assert.match((await core.status({ ...stranger, chatId: "other" }, id)).text, /not a party/);
});

test("telegram route: 401 without secret", async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret_value";
  const { POST } = await import("../app/api/telegram/webhook/route");
  const res = await POST(new Request("http://x/api/telegram/webhook", { method: "POST", body: "{}", headers: { "x-telegram-bot-api-secret-token": "wrong" } }));
  assert.equal(res.status, 401);
  const noTok = await POST(new Request("http://x/api/telegram/webhook", { method: "POST", body: JSON.stringify({ update_id: 1 }), headers: { "x-telegram-bot-api-secret-token": "s3cret_value" } }));
  assert.equal(noTok.status, 200);
});

test("telegram country step rejects NG with a clear payout error", async () => {
  const core = await import("../lib/chatbots/core");
  const u = { platform: "telegram" as const, userId: "tg-ng-test", chatId: "tg-ng-test", name: "TEST" };
  let r = await core.startCreate(u, "20 USD to Ada <ada@example.com> for one logo");
  for (let i = 0; i < 6 && !/country/i.test(r.text); i++) r = await core.answerDraft(u, "payer@example.com");
  if (/country/i.test(r.text)) { r = await core.answerDraft(u, "NG"); assert.match(r.text, /doesn't list NG/); }
});
