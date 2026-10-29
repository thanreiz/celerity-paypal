// Approval against a fake PayPal that can fail in the ways a real network
// does: no answer after accepting the batch, or a definite refusal.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_WEBHOOK_ID = "";
process.env.ALLOW_UNVERIFIED_WEBHOOKS = "1";

const { createMemoryStore } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");
const { eligibility } = await import("../src/policy.js");

// --- fake PayPal: batches keyed by PayPal-Request-Id, like PayPal's idempotency
let mode = "ok"; // ok | lose-answer | refuse | hang
let release;
const created = new Map();
const posts = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://api-m.sandbox.paypal.com")) return realFetch(url, init);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/v1/oauth2/token")) return json(200, { access_token: "tok", expires_in: 3600 });
  if (u.endsWith("/v1/payments/payouts") && init.method === "POST") {
    const rid = init.headers["PayPal-Request-Id"];
    posts.push(rid);
    if (mode === "refuse") {
      return json(422, {
        name: "INSUFFICIENT_FUNDS",
        message: "Sender does not have sufficient funds.",
        details: [{ field: "items[0].receiver", value: "someone@example.com", issue: "x" }],
        debug_id: "dbg1",
      });
    }
    if (mode === "hang") await new Promise((r) => (release = r));
    if (!created.has(rid)) created.set(rid, { batch_header: { payout_batch_id: `PB${created.size + 1}`, batch_status: "PENDING" } });
    if (mode === "lose-answer") throw new TypeError("fetch failed");
    return json(201, created.get(rid));
  }
  return json(404, { name: "RESOURCE_NOT_FOUND" });
};

const KEY = "k";
const store = createMemoryStore({ seed: seedState });
let server, base;
const api = (path, { method = "GET", body } = {}) =>
  realFetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-coordinator-key": KEY },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

before(async () => {
  const app = createApp({ store, coordinatorKey: KEY });
  await new Promise((r) => (server = app.listen(0, "127.0.0.1", r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// A run awaiting approval with one in-policy draft per family.
async function makeRun(familyIds, storm = "Typhoon Test") {
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

const backdate = (runId) =>
  store.mutate((state) => {
    const run = state.runs.find((r) => r.id === runId);
    state.batches.find((b) => b.id === run.batch_id).submitted_at = new Date(Date.now() - 60_000).toISOString();
  });

test("a lost PayPal answer leaves the batch SUBMITTING; resuming adopts it without paying twice", async () => {
  const runId = await makeRun(["fam_001"]);
  mode = "lose-answer";
  const first = await api(`/api/runs/${runId}/approve`, { method: "POST" });
  assert.equal(first.status, 502);
  assert.match(first.body.error, /approve again to resume/);

  let state = await store.read();
  const run = state.runs.find((r) => r.id === runId);
  assert.equal(run.status, "submitting");
  const batch = state.batches.find((b) => b.id === run.batch_id);
  assert.equal(batch.status, "SUBMITTING");

  // Meanwhile the family counts as paid: another run for the storm can't re-draft it.
  const el = eligibility(state, state.families.find((f) => f.id === "fam_001"), { storm: "Typhoon Test", areas: run.areas });
  assert.equal(el.eligible, false);

  // Too soon to resume: another instance may still be waiting on PayPal.
  assert.equal((await api(`/api/runs/${runId}/approve`, { method: "POST" })).status, 409);
  assert.equal((await api(`/api/batches/${batch.id}/refresh`, { method: "POST" })).status, 409);

  await backdate(runId);
  mode = "ok";
  const resumed = await api(`/api/runs/${runId}/approve`, { method: "POST" });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.payout_batch_id, "PB1");
  assert.equal(created.size, 1, "PayPal created exactly one batch");
  assert.deepEqual(posts, [`celerity-${runId}-1`, `celerity-${runId}-1`], "the resume reused the request id");

  state = await store.read();
  assert.equal(state.runs.find((r) => r.id === runId).status, "approved");
  assert.ok(state.events.some((e) => e.type === "payout.unconfirmed"));
  assert.ok(state.events.some((e) => e.type === "payout.resumed"));
});

test("a definite PayPal refusal returns the run for another try, and the public log carries no error payload", async () => {
  posts.length = 0;
  const runId = await makeRun(["fam_002"], "Typhoon Other");
  mode = "refuse";
  const res = await api(`/api/runs/${runId}/approve`, { method: "POST" });
  assert.equal(res.status, 502);
  assert.equal(res.body.debugId, "dbg1");

  const state = await store.read();
  const run = state.runs.find((r) => r.id === runId);
  assert.equal(run.status, "awaiting_approval");
  assert.equal(state.batches.filter((b) => b.run_id === runId).length, 0);
  const err = state.events.findLast((e) => e.type === "payout.error");
  assert.equal(err.detail.details, undefined, "PayPal's details are never stored");
  assert.equal(err.detail.name, "INSUFFICIENT_FUNDS");

  const pub = await realFetch(`${base}/api/public`).then((r) => r.json());
  const pubErr = pub.events.find((e) => e.type === "payout.error");
  assert.deepEqual(pubErr.detail, { name: "INSUFFICIENT_FUNDS", debugId: "dbg1" });
  assert.equal(JSON.stringify(pub).includes("@"), false);
  assert.ok(pub.events.every((e) => ["agent", "paypal", "paypal-webhook", "paypal-poll", "coordinator"].includes(e.actor)));

  // The retry is a new attempt with a new request id.
  mode = "ok";
  assert.equal((await api(`/api/runs/${runId}/approve`, { method: "POST" })).status, 200);
  assert.deepEqual(posts, [`celerity-${runId}-1`, `celerity-${runId}-2`]);
});

test("webhooks and other writes are not blocked while PayPal is slow", async () => {
  const runId = await makeRun(["fam_003"], "Typhoon Slow");
  mode = "hang";
  const pending = api(`/api/runs/${runId}/approve`, { method: "POST" });
  while (!release) await new Promise((r) => setTimeout(r, 5));

  const hook = await realFetch(`${base}/api/webhooks/paypal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "WH-slow", event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS", resource: { batch_header: { payout_batch_id: "PB1", batch_status: "SUCCESS" } } }),
  });
  assert.equal(hook.status, 200);
  assert.equal((await api("/api/families/fam_016", { method: "PATCH", body: { status: "active" } })).status, 200);

  release();
  assert.equal((await pending).status, 200);
});

test("registration rejects wrong types and oversized fields", async () => {
  const base = { municipality: "Virac", province: "Catanduanes", paypal_email: "qa@example.com", household_size: 3 };
  const cases = [
    [{ ...base, name: { x: 1 } }, 400, /missing name/],
    [{ ...base, name: "n".repeat(101) }, 400, /at most 100/],
    [{ ...base, name: "Ok", province: "p".repeat(61) }, 400, /province must be at most 60/],
  ];
  for (const [body, status, msg] of cases) {
    const res = await api("/api/families", { method: "POST", body });
    assert.equal(res.status, status, JSON.stringify(res.body));
    assert.match(res.body.error, msg);
  }
  const ok = await api("/api/families", { method: "POST", body: { ...base, name: "Flag Test", vulnerability: { senior: "false", pwd: true } } });
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.body.vulnerability, { senior: false, pwd: true, infant: false, pregnant: false });

  const arr = await api("/api/bulletins", { method: "POST", body: { text: ["a".repeat(50)] } });
  assert.equal(arr.status, 400);
  assert.match(arr.body.error, /must be a string/);
});
