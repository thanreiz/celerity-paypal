// Money-path regressions: reversed funding, webhooks that beat our own
// writes, failed batches, missing credentials, bad PayPal answers, a reused
// sender_batch_id, pending captures and the webhook age window.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_WEBHOOK_ID = "";
process.env.ALLOW_UNVERIFIED_WEBHOOKS = "1";

const { createMemoryStore, emptyState, eventLogger } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");
const { config } = await import("../src/config.js");
const { allocateRun, poolBalances, completeContribution, reverseContribution } = await import("../src/funding.js");
const { PayPalError, createPayoutBatch } = await import("../src/paypal.js");
const { WEBHOOK_IDS_KEPT, applyWebhookEvent } = await import("../src/payouts.js");
const { eligibility } = await import("../src/policy.js");

// --- fake PayPal -----------------------------------------------------------------
const knobs = { payout: "ok", capture: "COMPLETED", batchStatus: "PENDING", unauthorizedOnce: false };
const tokenCalls = [];
const orders = new Map();
const created = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://api-m.sandbox.paypal.com")) return realFetch(url, init);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/v1/oauth2/token")) {
    tokenCalls.push(1);
    return json(200, { access_token: `tok${tokenCalls.length}`, expires_in: 3600 });
  }
  if (u.endsWith("/v1/notifications/verify-webhook-signature")) return json(200, { verification_status: "SUCCESS" });
  if (u.endsWith("/v2/checkout/orders") && init.method === "POST") {
    const id = `ORD${orders.size + 1}`;
    orders.set(id, JSON.parse(init.body));
    return json(201, { id, links: [{ rel: "payer-action", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] });
  }
  const m = u.match(/\/v2\/checkout\/orders\/(\w+)\/capture$/);
  if (m) {
    const unit = orders.get(m[1]).purchase_units[0];
    return json(201, { id: m[1], purchase_units: [{ payments: { captures: [{ id: `CAP_${m[1]}`, status: knobs.capture, amount: { value: unit.amount.value, currency_code: "USD" } }] } }] });
  }
  if (u.endsWith("/v1/payments/payouts") && init.method === "POST") {
    if (knobs.unauthorizedOnce) {
      knobs.unauthorizedOnce = false;
      return json(401, { name: "AUTHENTICATION_FAILURE", message: "Authentication failed" });
    }
    if (knobs.payout === "html") return new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } });
    if (knobs.payout === "dup") {
      return json(400, { name: "USER_BUSINESS_ERROR", message: "Batch with given sender_batch_id already exists", details: [{ issue: "DUPLICATE_BATCH_ID" }] });
    }
    if (knobs.payout === "dup-text") return json(422, { name: "UNPROCESSABLE_ENTITY", message: "The sender_batch_id has already been used" });
    if (knobs.payout === "timeout") return json(408, { name: "REQUEST_TIMEOUT", message: "Request timed out" });
    const rid = init.headers["PayPal-Request-Id"];
    if (!created.has(rid)) created.set(rid, { batch_header: { payout_batch_id: `MB${created.size + 1}`, batch_status: "PENDING" } });
    return json(201, created.get(rid));
  }
  const g = u.match(/\/v1\/payments\/payouts\/(\w+)/);
  if (g && (init.method || "GET") === "GET") return json(200, { batch_header: { payout_batch_id: g[1], batch_status: knobs.batchStatus }, items: [] });
  return json(404, { name: "RESOURCE_NOT_FOUND" });
};

const KEY = "k";
const store = createMemoryStore({ seed: seedState });
let server, base;
const api = (path, { method = "GET", body, key = KEY, headers = {} } = {}) =>
  realFetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: { "Content-Type": "application/json", ...(key ? { "x-coordinator-key": key } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
const hook = (event, headers) => api("/api/webhooks/paypal", { method: "POST", key: null, body: event, headers });

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

async function makeRun(familyIds, storm) {
  return store.mutate((state) => {
    const run = {
      id: `run_${Math.random().toString(16).slice(2, 10)}`,
      bulletin_id: "blt_dalisay_08",
      status: "awaiting_approval",
      storm,
      areas: [{ province: "Catanduanes", municipality: null, signal_level: 4 }],
      drafts: [],
      steps: [],
      started_at: new Date().toISOString(),
    };
    for (const id of familyIds) {
      const el = eligibility(state, state.families.find((f) => f.id === id), run);
      run.drafts.push({ family_id: id, amount: el.max_amount, currency: "USD" });
    }
    state.runs.push(run);
    return run.id;
  });
}

// --- 1. reversed funding ----------------------------------------------------------
function world() {
  const s = emptyState();
  seedState(s);
  s.pools = [
    { id: "p_a", name: "A", funder: "A", provinces: ["Catanduanes"] },
    { id: "p_b", name: "B", funder: "B", provinces: [] },
  ];
  s.contributions = [
    { id: "c_a", pool_id: "p_a", amount: 100, currency: "USD", status: "completed", order_id: "OA", capture_id: "CA", funder_name: "F" },
    { id: "c_b", pool_id: "p_b", amount: 100, currency: "USD", status: "completed", order_id: "OB", capture_id: "CB", funder_name: "F" },
  ];
  return s;
}

test("a partial refund reduces the contribution; a reversal or denial takes all of it; replays change nothing", () => {
  const s = world();
  const log = eventLogger(s);
  const refund = { type: "PAYMENT.CAPTURE.REFUNDED", orderId: "OA", captureIds: [null, "CA"], refundId: "R1", amount: "30.00", currency: "USD", source: "paypal-webhook" };
  assert.equal(reverseContribution(s, log, refund).reversed, true);
  assert.equal(poolBalances(s).p_a.contributed, 70);
  assert.equal(reverseContribution(s, log, refund).duplicate, true, "same refund id is applied once");
  assert.equal(poolBalances(s).p_a.contributed, 70);

  // Matched by capture id alone, and the rest of the money refunded.
  reverseContribution(s, log, { ...refund, orderId: undefined, refundId: "R2", amount: "70.00" });
  assert.equal(s.contributions[0].status, "refunded");
  assert.equal(poolBalances(s).p_a.contributed, 0);

  assert.equal(reverseContribution(s, log, { type: "PAYMENT.CAPTURE.REVERSED", captureIds: ["CB"], source: "paypal-webhook" }).reversed, true);
  assert.equal(s.contributions[1].status, "reversed");
  assert.equal(poolBalances(s).p_b.contributed, 0);

  // No amount on a refund: logged, balance untouched.
  const t = world();
  const out = reverseContribution(t, eventLogger(t), { ...refund, amount: undefined });
  assert.equal(out.unapplied, true);
  assert.equal(poolBalances(t).p_a.contributed, 100);

  assert.deepEqual(s.events.map((e) => e.type), ["pool.funding_reversed", "pool.funding_reversed", "pool.funding_reversed"]);
  assert.equal(s.events[0].detail.partial, true);

  // A refund that beats the COMPLETED report must not let it credit the pool.
  const u = world();
  u.contributions.push({ id: "c_p", pool_id: "p_a", amount: 50, currency: "USD", status: "pending", order_id: "OP" });
  reverseContribution(u, eventLogger(u), { type: "PAYMENT.CAPTURE.DENIED", orderId: "OP", captureIds: ["CP"], source: "paypal-webhook" });
  assert.equal(completeContribution(u, eventLogger(u), { orderId: "OP", captureId: "CP", status: "COMPLETED", amount: "50.00", currency: "USD", source: "paypal" }).reversed, "denied");
  assert.equal(poolBalances(u).p_a.contributed, 100);
});

test("a pool whose money was reversed after payouts is negative and approval allocates nothing from it", () => {
  const s = world();
  s.batches = [{ id: "b1", items: [{ family_id: "fam_x", status: "SUCCESS", funding: [{ pool_id: "p_a", amount: 80 }] }] }];
  reverseContribution(s, eventLogger(s), { type: "PAYMENT.CAPTURE.REVERSED", captureIds: ["CA"], source: "paypal-webhook" });
  assert.equal(poolBalances(s).p_a.available, -80);
  const run = { areas: [{ province: "Catanduanes", municipality: null, signal_level: 4 }], drafts: [{ family_id: "fam_001", amount: 30 }] };
  const { allocations, shortfalls } = allocateRun(s, run);
  assert.deepEqual(shortfalls, []);
  assert.deepEqual(allocations.fam_001, [{ pool_id: "p_b", amount: 30 }]);
  // Nothing but the negative pool left: refused, not allocated.
  s.contributions.pop();
  assert.equal(allocateRun(s, run).shortfalls.length, 1);
});

test("PAYMENT.CAPTURE.REFUNDED over HTTP debits the pool, matched by the order id in related_ids", async () => {
  const start = await api("/api/pools/pool_rice_ph/fund", { method: "POST", key: null, body: { funder_name: "Refunded Fund", amount: 400 } });
  const { order_id } = await start.json();
  await api(`/api/fund/return?token=${order_id}`, { key: null });
  const balance = async () => (await (await api("/api/pools", { key: null })).json()).pools.find((p) => p.id === "pool_rice_ph").contributed;
  const funded = await balance();
  const res = await hook({
    id: "WH-refund-1",
    event_type: "PAYMENT.CAPTURE.REFUNDED",
    resource: { id: "REFUND1", status: "COMPLETED", amount: { value: "150.00", currency_code: "USD" }, supplementary_data: { related_ids: { order_id } } },
  });
  assert.equal(res.status, 200);
  assert.equal(await balance(), funded - 150);
  const ev = (await store.read()).events.findLast((e) => e.type === "pool.funding_reversed");
  assert.equal(ev.detail.amount, 150);
  assert.equal(ev.detail.partial, true);
});

// --- 2. webhook before the batch id is saved -------------------------------------------
test("a payout event for an unknown batch is retried (503) until it is old; only applied or ignored events are marked seen", async () => {
  const fresh = new Date().toISOString();
  const evt = (id, created) => ({ id, create_time: created, event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS", resource: { batch_header: { payout_batch_id: "NOT_YET", batch_status: "SUCCESS" } } });
  assert.equal((await hook(evt("WH-early", fresh))).status, 503);
  assert.equal((await store.read()).webhookIds.includes("WH-early"), false, "not recorded, so PayPal's retry is processed");
  // Same id again: still not a duplicate.
  assert.equal((await hook(evt("WH-early", fresh))).status, 503);
  // Old event: acknowledged and recorded so PayPal stops.
  const old = new Date(Date.now() - 60 * 60_000).toISOString();
  assert.equal((await hook(evt("WH-old", old))).status, 200);
  assert.ok((await store.read()).webhookIds.includes("WH-old"));
  // A type this app doesn't handle is deliberately ignored: recorded, 200.
  assert.equal((await hook({ id: "WH-other", create_time: fresh, event_type: "CATALOG.PRODUCT.CREATED", resource: {} })).status, 200);
  assert.ok((await store.read()).webhookIds.includes("WH-other"));

  // Once the batch exists, the retry is applied.
  const runId = await makeRun(["fam_004"], "Typhoon Early");
  assert.equal((await api(`/api/runs/${runId}/approve`, { method: "POST" })).status, 200);
  const batch = (await store.read()).batches.find((b) => b.run_id === runId);
  const ok = await hook({ ...evt("WH-early", fresh), resource: { batch_header: { payout_batch_id: batch.payout_batch_id, batch_status: "PROCESSING" } } });
  assert.equal(ok.status, 200);
  assert.ok((await store.read()).webhookIds.includes("WH-early"));
});

test("the seen-event list keeps well over what three days of retries can hold", () => {
  assert.ok(WEBHOOK_IDS_KEPT >= 20_000);
  const s = emptyState();
  for (let i = 0; i < WEBHOOK_IDS_KEPT; i++) s.webhookIds.push(`E${i}`);
  applyWebhookEvent(s, eventLogger(s), { id: "NEW", event_type: "OTHER.TYPE", resource: {} });
  assert.equal(s.webhookIds.length, WEBHOOK_IDS_KEPT);
  assert.ok(s.webhookIds.includes("E5000"), "an id from beyond the old 5000 cap is still remembered");
});

// --- 3. failed batches free their items ------------------------------------------------
test("a DENIED batch webhook and a CANCELED refresh move pending items to a not-paid status", async () => {
  for (const via of ["webhook", "refresh"]) {
    const fam = via === "webhook" ? "fam_001" : "fam_002";
    const runId = await makeRun([fam], `Typhoon ${via}`);
    assert.equal((await api(`/api/runs/${runId}/approve`, { method: "POST" })).status, 200);
    let state = await store.read();
    const batch = state.batches.find((b) => b.run_id === runId);
    assert.equal(batch.items[0].status, "PENDING");
    const committed = poolBalances(state);
    if (via === "webhook") {
      const status = batch.items[0].funding[0].pool_id;
      assert.ok(committed[status].committed > 0);
      const res = await hook({ id: `WH-denied-${via}`, event_type: "PAYMENT.PAYOUTSBATCH.DENIED", resource: { batch_header: { payout_batch_id: batch.payout_batch_id, batch_status: "DENIED" } } });
      assert.equal(res.status, 200);
    } else {
      knobs.batchStatus = "CANCELED";
      assert.equal((await api(`/api/batches/${batch.id}/refresh`, { method: "POST" })).status, 200);
      knobs.batchStatus = "PENDING";
    }
    state = await store.read();
    const after = state.batches.find((b) => b.run_id === runId);
    assert.equal(after.items[0].status, via === "webhook" ? "DENIED" : "CANCELED");
    const poolId = after.items[0].funding[0].pool_id;
    assert.ok(poolBalances(state)[poolId].committed < committed[poolId].committed, "the pool money is free again");
  }
});

// --- 4. no credentials --------------------------------------------------------------------
test("without PayPal credentials, approval answers 503 and the run stays awaiting approval; funding answers 503 and costs no rate-limit slot", async () => {
  const runId = await makeRun(["fam_003"], "Typhoon NoCreds");
  const id = config.paypal.clientId;
  const secret = config.paypal.clientSecret;
  config.paypal.clientId = "";
  config.paypal.clientSecret = "";
  const warn = console.warn;
  const lines = [];
  console.warn = (...a) => lines.push(a.join(" "));
  try {
    const res = await api(`/api/runs/${runId}/approve`, { method: "POST" });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /PayPal is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET/);
    const state = await store.read();
    assert.equal(state.runs.find((r) => r.id === runId).status, "awaiting_approval");
    assert.equal(state.batches.filter((b) => b.run_id === runId).length, 0);

    for (let i = 0; i < 12; i++) {
      const r = await api("/api/pools/pool_rice_ph/fund", { method: "POST", key: null, body: { funder_name: "X", amount: 500 } });
      assert.equal(r.status, 503, `call ${i}`);
    }
    assert.equal(lines.length, 12, "one line per refusal");
  } finally {
    console.warn = warn;
    config.paypal.clientId = id;
    config.paypal.clientSecret = secret;
  }
  // The run can still be rejected, and funding works again.
  assert.equal((await api(`/api/runs/${runId}/reject`, { method: "POST", body: {} })).status, 200);
  assert.equal((await api("/api/pools/pool_rice_ph/fund", { method: "POST", key: null, body: { funder_name: "X", amount: 500 } })).status, 201);
});

// --- 5. paypal.js ------------------------------------------------------------------------
test("an HTML answer from a gateway becomes a PayPalError with the HTTP status", async () => {
  knobs.payout = "html";
  try {
    await assert.rejects(
      createPayoutBatch({ senderBatchId: "s1", emailSubject: "x", emailMessage: "x", items: [] }),
      (e) => e instanceof PayPalError && e.status === 502
    );
  } finally {
    knobs.payout = "ok";
  }
});

test("a 401 drops the cached token and the call is retried once with a fresh one", async () => {
  const before = tokenCalls.length;
  knobs.unauthorizedOnce = true;
  const res = await createPayoutBatch({ senderBatchId: "s401", emailSubject: "x", emailMessage: "x", items: [] });
  assert.ok(res.batch_header.payout_batch_id);
  assert.equal(tokenCalls.length - before, 1, "one new token was fetched");
});

// --- 6. reused sender_batch_id / 408 -----------------------------------------------------
test("a 'batch id already exists' answer keeps the batch; a webhook then completes it. A 408 is not a rejection", async () => {
  for (const mode of ["dup", "dup-text", "timeout"]) {
    const fam = { dup: "fam_001", "dup-text": "fam_002", timeout: "fam_003" }[mode];
    const runId = await makeRun([fam], `Typhoon ${mode}`);
    knobs.payout = mode;
    const res = await api(`/api/runs/${runId}/approve`, { method: "POST" });
    knobs.payout = "ok";
    assert.equal(res.status, 502);
    const state = await store.read();
    const run = state.runs.find((r) => r.id === runId);
    assert.equal(run.status, "submitting", mode);
    assert.equal(state.batches.filter((b) => b.run_id === runId).length, 1, mode);
    if (mode === "dup") assert.match((await res.json()).error, /already has a batch/);

    if (mode === "dup") {
      const batch = state.batches.find((b) => b.run_id === runId);
      const ev = await hook({
        id: "WH-adopt",
        create_time: new Date().toISOString(),
        event_type: "PAYMENT.PAYOUTSBATCH.PROCESSING",
        resource: { batch_header: { payout_batch_id: "ADOPTED1", sender_batch_id: batch.sender_batch_id, batch_status: "PROCESSING" } },
      });
      assert.equal(ev.status, 200);
      const after = await store.read();
      assert.equal(after.batches.find((b) => b.run_id === runId).payout_batch_id, "ADOPTED1");
      assert.equal(after.runs.find((r) => r.id === runId).status, "approved");
    }
  }
});

// --- 7. pending capture -------------------------------------------------------------------
test("a capture PayPal leaves PENDING redirects with funded=pending, and the webhook credits it later", async () => {
  const start = await api("/api/pools/pool_rice_ph/fund", { method: "POST", key: null, body: { funder_name: "Slow Bank", amount: 250 } });
  const { order_id } = await start.json();
  knobs.capture = "PENDING";
  const back = await api(`/api/fund/return?token=${order_id}`, { key: null });
  knobs.capture = "COMPLETED";
  assert.equal(back.headers.get("location"), "https://relief.example/#/public?funded=pending");
  const res = await hook({
    id: "WH-pending-done",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: `CAP_${order_id}`, status: "COMPLETED", amount: { value: "250.00", currency_code: "USD" }, supplementary_data: { related_ids: { order_id } } },
  });
  assert.equal(res.status, 200);
  assert.equal((await store.read()).contributions.find((k) => k.order_id === order_id).status, "completed");
});

// --- 8. webhook age window ----------------------------------------------------------------
test("signed deliveries up to 3 days old are accepted; older ones are refused", async () => {
  config.paypal.webhookId = "WH-TEST";
  try {
    const signed = (age) => ({
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
      "paypal-transmission-id": "t",
      "paypal-transmission-sig": "sig",
      "paypal-transmission-time": new Date(Date.now() - age).toISOString(),
    });
    const e = (id) => ({ id, event_type: "CATALOG.PRODUCT.CREATED", resource: {} });
    const day = 24 * 60 * 60_000;
    assert.equal((await hook(e("WH-age-1"), signed(2 * day))).status, 200);
    assert.equal((await hook(e("WH-age-2"), signed(4 * day))).status, 400);
  } finally {
    config.paypal.webhookId = "";
  }
});
