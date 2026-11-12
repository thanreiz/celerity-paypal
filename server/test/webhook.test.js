// Webhook signature handling with PAYPAL_WEBHOOK_ID set and a fake PayPal
// verify endpoint.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_WEBHOOK_ID = "WH-TEST";
delete process.env.ALLOW_UNVERIFIED_WEBHOOKS;

const { createMemoryStore } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");

let verdict = "SUCCESS";
const verifyCalls = [];
const rawVerifyBodies = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://api-m.sandbox.paypal.com")) return realFetch(url, init);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/v1/oauth2/token")) return json(200, { access_token: "tok", expires_in: 3600 });
  if (u.endsWith("/v1/notifications/verify-webhook-signature")) {
    verifyCalls.push(JSON.parse(init.body));
    rawVerifyBodies.push(init.body);
    if (verdict === "MALFORMED") return json(400, { name: "VALIDATION_ERROR", message: "Invalid data provided" });
    return json(200, { verification_status: verdict });
  }
  return json(404, { name: "RESOURCE_NOT_FOUND" });
};

const store = createMemoryStore({ seed: seedState });
let server, base;
before(async () => {
  const app = createApp({ store, coordinatorKey: "" });
  await new Promise((r) => (server = app.listen(0, "127.0.0.1", r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const signedHeaders = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
  "paypal-transmission-id": "t-1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": new Date().toISOString(),
};
const post = (id, headers = {}) =>
  fetch(`${base}/api/webhooks/paypal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ id, event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS", resource: { batch_header: { payout_batch_id: "OTHER" } } }),
  });

test("unsigned and forged webhooks are rejected and leave the evidence log alone", async () => {
  assert.equal((await post("WH-A")).status, 400);
  assert.equal(verifyCalls.length, 0, "unsigned requests never reach PayPal");

  verdict = "FAILURE";
  assert.equal((await post("WH-B", signedHeaders)).status, 400);
  verdict = "MALFORMED";
  assert.equal((await post("WH-C", signedHeaders)).status, 400);
  assert.equal(verifyCalls.length, 2);
  assert.equal(verifyCalls[0].webhook_id, "WH-TEST");

  assert.equal((await store.read()).events.length, 0);
});

test("verified events for batches this app didn't send are acknowledged but not logged", async () => {
  verdict = "SUCCESS";
  assert.equal((await post("WH-D", signedHeaders)).status, 200);
  const state = await store.read();
  assert.equal(state.events.length, 0);
  assert.ok(state.webhookIds.includes("WH-D"));
});

test("PayPal is sent the webhook exactly as it was delivered, not a re-serialised copy", async () => {
  verdict = "SUCCESS";
  // Keys in an unusual order, spacing and a number written as 1.50: what a
  // parse and JSON.stringify would change.
  const delivered = '{"resource": {"batch_header": {"payout_batch_id": "OTHER"}, "amount": 1.50}, "event_type": "PAYMENT.PAYOUTSBATCH.SUCCESS", "id": "WH-RAW"}';
  const before = rawVerifyBodies.length;
  const res = await fetch(`${base}/api/webhooks/paypal`, { method: "POST", headers: { "Content-Type": "application/json", ...signedHeaders }, body: delivered });
  assert.equal(res.status, 200);
  const sent = rawVerifyBodies[before];
  assert.ok(sent.endsWith(`"webhook_event":${delivered}}`), "the delivered bytes are spliced in unchanged");
  assert.equal(JSON.parse(sent).webhook_id, "WH-TEST");
});
