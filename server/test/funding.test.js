// Funders and pools: the pro-rata split, dry pools, PayPal Checkout funding
// (return redirect and webhook), and what the public sees.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_WEBHOOK_ID = "";
process.env.ALLOW_UNVERIFIED_WEBHOOKS = "1";

const { createMemoryStore, emptyState, eventLogger } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");
const { allocateRun, poolBalances, fundingProblem, completeContribution } = await import("../src/funding.js");
const { checkDraft } = await import("../src/policy.js");

// Two pools like the seed but with round numbers: a Bicol pool and a
// nationwide pool.
function world({ bicol = 100, national = 50 } = {}) {
  const s = emptyState();
  seedState(s);
  s.pools = [
    { id: "p_bicol", name: "Bicol", funder: "A", provinces: ["Catanduanes", "Albay"] },
    { id: "p_ph", name: "PH", funder: "B", provinces: [] },
  ];
  s.contributions = [
    { pool_id: "p_bicol", amount: bicol, status: "completed" },
    { pool_id: "p_ph", amount: national, status: "completed" },
  ];
  return s;
}
const run = (drafts) => ({ storm: "Typhoon Test", areas: [{ province: "Catanduanes", municipality: null, signal_level: 4 }], drafts });

test("a payout is split pro-rata across every pool that covers the family", () => {
  const s = world();
  const { allocations, shortfalls } = allocateRun(s, run([{ family_id: "fam_001", amount: 30 }]));
  assert.deepEqual(shortfalls, []);
  assert.deepEqual(allocations.fam_001, [
    { pool_id: "p_bicol", amount: 20 },
    { pool_id: "p_ph", amount: 10 },
  ]);
});

test("a family outside a pool's provinces is paid only by the pools that cover it", () => {
  const s = world();
  // fam_015 is in Quezon: only the nationwide pool covers it.
  const { allocations } = allocateRun(s, run([{ family_id: "fam_015", amount: 20 }]));
  assert.deepEqual(allocations.fam_015, [{ pool_id: "p_ph", amount: 20 }]);
});

test("odd centavos are placed without overdrawing any pool, and the split sums exactly", () => {
  const s = world({ bicol: 0.02, national: 0.01 });
  const { allocations } = allocateRun(s, run([{ family_id: "fam_001", amount: 0.03 }]));
  assert.deepEqual(allocations.fam_001, [
    { pool_id: "p_bicol", amount: 0.02 },
    { pool_id: "p_ph", amount: 0.01 },
  ]);
  const s2 = world({ bicol: 10, national: 10 });
  const split = allocateRun(s2, run([{ family_id: "fam_001", amount: 0.01 }])).allocations.fam_001;
  assert.equal(split.reduce((t, x) => t + Math.round(x.amount * 100), 0), 1);
});

test("drafts that the pools can't cover are named, and the agent is refused", () => {
  const s = world({ bicol: 40, national: 0 });
  const r = run([
    { family_id: "fam_001", amount: 30 },
    { family_id: "fam_002", amount: 30 },
  ]);
  const { shortfalls } = allocateRun(s, r);
  assert.deepEqual(shortfalls, [{ family_id: "fam_002", province: "Catanduanes", short: 20, available: 10 }]);
  assert.match(fundingProblem(s, { drafts: [r.drafts[0]] }, r.drafts[1]), /only 10 \w+ left/);
  assert.match(checkDraft(s, { ...r, drafts: [r.drafts[0]] }, { family_id: "fam_002", amount: 30 }).join(), /funding pools for Catanduanes/);

  s.pools = s.pools.filter((p) => p.id !== "p_ph");
  s.pools[0].provinces = ["Albay"];
  assert.match(fundingProblem(s, { drafts: [] }, { family_id: "fam_001", amount: 1 }), /no funding pool covers Catanduanes/);
});

test("money committed to a payout that never arrived goes back to its pools", () => {
  const s = world();
  s.batches.push({ items: [{ family_id: "fam_001", status: "PENDING", funding: [{ pool_id: "p_bicol", amount: 60 }, { pool_id: "p_ph", amount: 30 }] }] });
  assert.equal(poolBalances(s).p_bicol.available, 40);
  s.batches[0].items[0].status = "FAILED";
  assert.equal(poolBalances(s).p_bicol.available, 100);
  // Pending checkouts don't count until PayPal captures them.
  s.contributions.push({ pool_id: "p_ph", amount: 999, status: "pending" });
  assert.equal(poolBalances(s).p_ph.contributed, 50);
});

test("a capture credits its pool once, only for the amount the funder chose", () => {
  const s = world();
  const log = eventLogger(s);
  s.contributions.push({ id: "c1", pool_id: "p_ph", amount: 500, currency: "USD", status: "pending", order_id: "O1" });
  s.contributions.push({ id: "c2", pool_id: "p_ph", amount: 500, currency: "USD", status: "pending", order_id: "O2" });

  assert.equal(completeContribution(s, log, { orderId: "O1", captureId: "C1", status: "COMPLETED", amount: "500.00", currency: "USD", source: "paypal" }).funded, true);
  assert.equal(completeContribution(s, log, { orderId: "O1", captureId: "C1", status: "COMPLETED", amount: "500.00", currency: "USD", source: "paypal-webhook" }).duplicate, true);
  assert.equal(completeContribution(s, log, { orderId: "O2", captureId: "C2", status: "COMPLETED", amount: "5.00", currency: "USD", source: "paypal" }).mismatch, true);
  assert.equal(poolBalances(s).p_ph.contributed, 550);
  assert.deepEqual(s.events.map((e) => e.type), ["pool.funded", "pool.funding_mismatch"]);
});

// --- HTTP: checkout, approval, public view -------------------------------------

const orders = new Map();
const payoutPosts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://api-m.sandbox.paypal.com")) return realFetch(url, init);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/v1/oauth2/token")) return json(200, { access_token: "tok", expires_in: 3600 });
  if (u.endsWith("/v2/checkout/orders") && init.method === "POST") {
    const body = JSON.parse(init.body);
    const id = `ORDER${orders.size + 1}`;
    orders.set(id, { body, captured: false });
    return json(201, { id, status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] });
  }
  const m = u.match(/\/v2\/checkout\/orders\/(\w+)(\/capture)?$/);
  if (m) {
    const o = orders.get(m[1]);
    const unit = o.body.purchase_units[0];
    const captured = { id: m[1], status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: `CAP_${m[1]}`, status: "COMPLETED", amount: { value: o.paidValue || unit.amount.value, currency_code: unit.amount.currency_code } }] } }] };
    if (m[2]) {
      if (o.captured) return json(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] });
      o.captured = true;
    }
    return json(m[2] ? 201 : 200, captured);
  }
  if (u.endsWith("/v1/payments/payouts") && init.method === "POST") {
    payoutPosts.push(JSON.parse(init.body));
    return json(201, { batch_header: { payout_batch_id: `PB${payoutPosts.length}`, batch_status: "PENDING" } });
  }
  return json(404, { name: "RESOURCE_NOT_FOUND" });
};

const KEY = "k";
const store = createMemoryStore({ seed: seedState });
let server, base;
const api = (path, { method = "GET", body, key = KEY } = {}) =>
  realFetch(`${base}${path}`, {
    method,
    redirect: "manual",
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

const balanceOf = async (poolId) => (await (await api("/api/pools", { key: null })).json()).pools.find((p) => p.id === poolId);

test("anyone can fund a pool through PayPal Checkout; the pool is credited once, on capture", async () => {
  const before = await balanceOf("pool_rice_ph");
  for (const [body, msg] of [
    [{ funder_name: "", amount: 500 }, /funder_name is required/],
    [{ funder_name: "X", amount: 50 }, /between 100 and/],
    [{ funder_name: "X", amount: 100.555 }, /decimals/],
  ]) {
    const r = await api("/api/pools/pool_rice_ph/fund", { method: "POST", key: null, body });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, msg);
  }
  assert.equal((await api("/api/pools/nope/fund", { method: "POST", key: null, body: { funder_name: "X", amount: 500 } })).status, 404);

  const start = await api("/api/pools/pool_rice_ph/fund", { method: "POST", key: null, body: { funder_name: "Bayanihan Fund", amount: 500 } });
  assert.equal(start.status, 201);
  const { approveUrl, order_id } = await start.json();
  assert.match(approveUrl, /sandbox\.paypal\.com/);
  const sent = orders.get(order_id).body;
  assert.equal(sent.purchase_units[0].custom_id, "pool_rice_ph");
  assert.equal(sent.payment_source.paypal.experience_context.return_url, "https://relief.example/api/fund/return");
  assert.equal((await balanceOf("pool_rice_ph")).contributed, before.contributed, "nothing credited before capture");

  const back = await api(`/api/fund/return?token=${order_id}&PayerID=P1`, { key: null });
  assert.equal(back.status, 302);
  assert.equal(back.headers.get("location"), `https://relief.example/#/public?funded=pool_rice_ph&amount=500`);
  assert.equal((await balanceOf("pool_rice_ph")).contributed, before.contributed + 500);

  // A reload of the return page, then the webhook: still credited once.
  assert.equal((await api(`/api/fund/return?token=${order_id}`, { key: null })).status, 302);
  const hook = await api("/api/webhooks/paypal", {
    method: "POST",
    key: null,
    body: { id: "WH-cap", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: `CAP_${order_id}`, status: "COMPLETED", amount: { value: "500.00", currency_code: "USD" }, supplementary_data: { related_ids: { order_id } } } },
  });
  assert.equal(hook.status, 200);
  const after = await balanceOf("pool_rice_ph");
  assert.equal(after.contributed, before.contributed + 500);
  assert.equal(after.contributions.filter((c) => c.funder_name === "Bayanihan Fund").length, 1);

  const events = (await store.read()).events.filter((e) => e.type === "pool.funded");
  assert.equal(events.length, 1);
});

test("a cancelled checkout or a short capture credits nothing", async () => {
  const before = await balanceOf("pool_pcic_bicol");
  const a = await (await api("/api/pools/pool_pcic_bicol/fund", { method: "POST", key: null, body: { funder_name: "Gone", amount: 200 } })).json();
  const cancel = await api(`/api/fund/cancel?token=${a.order_id}`, { key: null });
  assert.equal(cancel.headers.get("location"), "https://relief.example/#/public?funded=cancelled");

  const b = await (await api("/api/pools/pool_pcic_bicol/fund", { method: "POST", key: null, body: { funder_name: "Short", amount: 300 } })).json();
  orders.get(b.order_id).paidValue = "3.00";
  const back = await api(`/api/fund/return?token=${b.order_id}`, { key: null });
  assert.equal(back.headers.get("location"), "https://relief.example/#/public?funded=failed");
  assert.equal((await balanceOf("pool_pcic_bicol")).contributed, before.contributed);
});

test("approval splits each payout across pools and is refused when a pool ran dry", async () => {
  const runId = await store.mutate((state) => {
    state.runs.push({
      id: "run_split",
      bulletin_id: "blt_dalisay_08",
      status: "awaiting_approval",
      storm: "Typhoon Split",
      areas: [{ province: "Catanduanes", municipality: null, signal_level: 4 }],
      drafts: [{ family_id: "fam_002", amount: 70, currency: "USD" }],
      steps: [],
      started_at: new Date().toISOString(),
    });
    return "run_split";
  });
  const preview = (await (await api("/api/state")).json()).runs.find((r) => r.id === runId).funding;
  assert.deepEqual(preview.shortfalls, []);
  assert.deepEqual(preview.pools.map((p) => p.pool_id).sort(), ["pool_pcic_bicol", "pool_rice_ph"]);

  const ok = await api(`/api/runs/${runId}/approve`, { method: "POST" });
  assert.equal(ok.status, 200);
  const batch = await ok.json();
  const split = batch.items[0].funding;
  assert.equal(split.reduce((t, x) => t + Math.round(x.amount * 100), 0), 7000);
  assert.equal(split.length, 2);

  // Drain the Bicol pools, then try another Catanduanes run.
  await store.mutate((state) => {
    for (const p of ["pool_pcic_bicol", "pool_rice_ph"]) {
      state.contributions.push({ pool_id: p, amount: -1_000_000, status: "completed" });
    }
    state.runs.push({ ...state.runs.find((r) => r.id === runId), id: "run_dry", status: "awaiting_approval", storm: "Typhoon Dry", drafts: [{ family_id: "fam_003", amount: 10, currency: "USD" }] });
  });
  const posts = payoutPosts.length;
  const dry = await api(`/api/runs/run_dry/approve`, { method: "POST" });
  assert.equal(dry.status, 409);
  assert.match(JSON.stringify(await dry.json()), /funding pools for Catanduanes/);
  assert.equal(payoutPosts.length, posts, "PayPal was not called");
});

test("the public pool ledger names funders and places, never families", async () => {
  const pub = await (await api("/api/public", { key: null })).json();
  const pcic = pub.pools.find((p) => p.id === "pool_pcic_bicol");
  assert.ok(pcic.payouts.some((p) => p.places.includes("Virac, Catanduanes") && p.families === 1));
  assert.ok(pcic.contributions.some((c) => c.source === "seed"));
  const text = JSON.stringify(pub);
  assert.equal(text.includes("@"), false);
  assert.equal(/fam_\d/.test(text), false);
  assert.ok(pub.events.some((e) => e.type === "payout.submitting" && Array.isArray(e.detail.pools)));
});

test("coordinators create pools; others can't", async () => {
  const body = { name: "Sorsogon co-op fund", funder: "Sorsogon Farmers Co-op", provinces: ["Sorsogon"] };
  assert.equal((await api("/api/pools", { method: "POST", key: null, body })).status, 401);
  const res = await api("/api/pools", { method: "POST", body });
  assert.equal(res.status, 201);
  assert.deepEqual((await res.json()).provinces, ["Sorsogon"]);
  assert.equal((await api("/api/pools", { method: "POST", body: { ...body, provinces: "Sorsogon" } })).status, 400);
});
