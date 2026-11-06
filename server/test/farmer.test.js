// The farmer's private link: tokens, what the farmer sees, the simulated SMS,
// and what stays private.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Jev is tested in jev.test.js; here it stays off.
delete process.env.TYPESAFE_API_KEY;
process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_WEBHOOK_ID = "";
process.env.ALLOW_UNVERIFIED_WEBHOOKS = "1";

const { createMemoryStore } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");
const { smsText, stormLabel, maskEmail } = await import("../src/notify.js");

const realFetch = globalThis.fetch;
let batches = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://api-m.sandbox.paypal.com")) return realFetch(url, init);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/v1/oauth2/token")) return json(200, { access_token: "tok", expires_in: 3600 });
  if (u.endsWith("/v1/payments/payouts") && init.method === "POST") {
    return json(201, { batch_header: { payout_batch_id: `PB${++batches}`, batch_status: "PENDING" } });
  }
  return json(404, { name: "RESOURCE_NOT_FOUND" });
};

const KEY = "k";
const store = createMemoryStore({ seed: seedState });
let server, base;
const api = (path, { method = "GET", body, key = KEY } = {}) =>
  realFetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { "x-coordinator-key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  process.env.PUBLIC_URL = "https://relief.example";
  const app = createApp({ store, coordinatorKey: KEY });
  await new Promise((r) => (server = app.listen(0, "127.0.0.1", r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  delete process.env.PUBLIC_URL;
});

const tokenOf = async (id) => (await store.read()).families.find((f) => f.id === id).link_token;

async function approvedRun(id, familyId, storm) {
  await store.mutate((state) => {
    state.runs.push({
      id,
      bulletin_id: "blt_dalisay_08",
      status: "awaiting_approval",
      storm,
      areas: [{ province: "Catanduanes", municipality: null, signal_level: 4 }],
      drafts: [{ family_id: familyId, amount: 25, currency: "USD" }],
      steps: [],
      started_at: new Date(Date.now() - 3 * 60_000).toISOString(),
    });
  });
  const res = await api(`/api/runs/${id}/approve`, { method: "POST" });
  assert.equal(res.status, 200);
}

test("every family has its own unguessable link; only coordinators see it", async () => {
  const s = await store.read();
  const tokens = s.families.map((f) => f.link_token);
  assert.ok(tokens.every((t) => typeof t === "string" && t.length >= 24));
  assert.equal(new Set(tokens).size, tokens.length);

  const state = await (await api("/api/state")).json();
  assert.ok(state.families.every((f) => f.link_token));
  for (const path of ["/api/public", "/api/pools"]) {
    const text = await (await api(path, { key: null })).text();
    assert.ok(tokens.every((t) => !text.includes(t)), `${path} leaks a link token`);
  }
});

test("a farmer's link shows only their own sent payouts, with who paid and how fast", async () => {
  await approvedRun("run_ramon", "fam_004", "Typhoon ESTER");
  // A draft still awaiting approval for the same family stays hidden.
  await store.mutate((state) => {
    state.runs.push({ id: "run_pending", status: "awaiting_approval", storm: "Typhoon Later", drafts: [{ family_id: "fam_004", amount: 10 }], steps: [], started_at: new Date().toISOString() });
  });
  await approvedRun("run_other", "fam_001", "Typhoon Other");

  const res = await api(`/api/me/${await tokenOf("fam_004")}`, { key: null });
  assert.equal(res.status, 200);
  const me = await res.json();
  assert.equal(me.first_name, "Ramon");
  assert.equal(me.payouts.length, 1);
  const p = me.payouts[0];
  assert.equal(p.storm, "Typhoon ESTER");
  assert.equal(p.amount, 25);
  assert.equal(p.payout_batch_id, "PB1");
  assert.match(p.receiver, /^\w{2}•+@/);
  assert.ok(p.funders.length >= 1 && p.funders.every((f) => f.name && f.amount > 0));
  assert.ok(Date.parse(p.started_at) < Date.parse(p.sent_at));

  const text = JSON.stringify(me);
  assert.equal(text.includes("Villanueva"), false, "only the first name");
  assert.equal(/fam_\d|vulnerab/.test(text), false);
  const email = (await store.read()).families.find((f) => f.id === "fam_004").paypal_email;
  assert.equal(text.includes(email), false, "only the masked email");
  // Another family's payout never shows; the storm itself may, in
  // storm_status, because it reached this family's town too.
  assert.equal(JSON.stringify(me.payouts).includes("Typhoon Other"), false);
  assert.ok(me.storm_status.storms.every((s) => s.my_signal > 0));
  assert.equal(me.registration.paypal_email, p.receiver);
});

test("a wrong link says nothing about who exists, and guessing is throttled", async () => {
  const res = await api("/api/me/not-a-real-token-at-all-xx", { key: null });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "link not found" });
  let status;
  for (let i = 0; i < 25; i++) status = (await api(`/api/me/guess-${i}-xxxxxxxxxxxxxxxxxxxx`, { key: null })).status;
  assert.equal(status, 429);
});

test("each sent payout carries the SMS its family got, in Tagalog and English", async () => {
  const state = await (await api("/api/state")).json();
  const item = state.batches.find((b) => b.run_id === "run_ramon").items[0];
  const token = await tokenOf("fam_004");
  assert.equal(item.sms.link, `https://relief.example/#/r/${token}`);
  assert.match(item.sms.tl, /^Celerity Relief: Ramon, ang \$25 na tulong para sa Bagyong Ester ay naipadala na sa PayPal mo\. Tingnan: https/);
  assert.match(item.sms.en, /your \$25 aid for Typhoon Ester was sent/);

  const pub = await (await api("/api/public", { key: null })).json();
  const notified = pub.events.find((e) => e.type === "farmer.notified");
  assert.deepEqual(notified.detail, { count: 1, channel: "sms (simulated)" });
});

test("families registered before links existed get one on the next coordinator read", async () => {
  await store.mutate((s) => {
    delete s.families.find((f) => f.id === "fam_016").link_token;
  });
  await api("/api/state");
  assert.ok((await tokenOf("fam_016"))?.length >= 24);
});

test("storm names and emails are written for people", () => {
  assert.equal(stormLabel("Super Typhoon DALISAY", "tl"), "Bagyong Dalisay");
  assert.equal(stormLabel("Tropical Depression Ana", "en"), "Typhoon Ana");
  assert.equal(stormLabel("", "tl"), "ang bagyo");
  assert.equal(maskEmail("juan@example.com"), "ju••@example.com");
  const sms = smsText({ name: "Maria Santos" }, { amount: 3250.5, currency: "PHP" }, { storm: "Typhoon Dalisay" }, "L");
  assert.match(sms.tl, /Maria, ang ₱3,250\.50 na tulong para sa Bagyong Dalisay/);
});
