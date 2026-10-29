// Error responses, cache headers, coordinator auth and storage edge cases.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_WEBHOOK_ID = "WH-TEST";

const { createMemoryStore, createPgStore, verifyChain } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://api-m.sandbox.paypal.com")) return realFetch(url, init);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/v1/oauth2/token")) return json(200, { access_token: "tok", expires_in: 3600 });
  return json(500, { name: "INTERNAL_SERVICE_ERROR", message: "internal detail from PayPal", debug_id: "dbg9" });
};

const KEY = "right-key";
const store = createMemoryStore({ seed: seedState });
let server, base;
const call = (path, { method = "GET", body, key = KEY, headers = {} } = {}) =>
  realFetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { "x-coordinator-key": key } : {}), ...headers },
    body: typeof body === "string" ? body : body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  const app = createApp({ store, coordinatorKey: KEY });
  await new Promise((r) => (server = app.listen(0, "127.0.0.1", r)));
  base = `http://127.0.0.1:${server.address().port}`;
  await store.mutate((state) => {
    state.batches.push({ id: "bat_x", payout_batch_id: "PBX", storm: "X", status: "PENDING", created_at: new Date().toISOString(), items: [] });
  });
});
after(() => server.close());

test("internal and PayPal errors are answered generically", async () => {
  const bad = await call("/api/bulletins", { method: "POST", body: '{"text":' });
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: "request body is not valid JSON" });

  const pp = await call("/api/batches/bat_x/refresh", { method: "POST" });
  assert.equal(pp.status, 502);
  assert.deepEqual(await pp.json(), { error: "PayPal request failed", debugId: "dbg9" });
});

test("API responses are not cached, except the public view at the CDN", async () => {
  assert.equal((await call("/api/state")).headers.get("cache-control"), "no-store");
  assert.equal((await call("/api/state", { key: "nope" })).headers.get("cache-control"), "no-store");
  assert.match((await call("/api/public", { key: null })).headers.get("cache-control"), /s-maxage=10/);
});

test("the coordinator name is cleaned before it is recorded", async () => {
  const res = await call("/api/families/fam_001", {
    method: "PATCH",
    body: { status: "suspended" },
    headers: { "x-coordinator-name": "<img src=x>Ana Reyes, MDRRMO;" },
  });
  assert.equal(res.status, 200);
  const e = (await store.read()).events.at(-1);
  assert.equal(e.actor, "img srcxAna Reyes, MDRRMO");
});

test("registering a second family on one PayPal email warns but succeeds", async () => {
  const fam = { name: "Dup One", municipality: "Virac", province: "Catanduanes", household_size: 2, paypal_email: "shared@example.com" };
  assert.equal((await (await call("/api/families", { method: "POST", body: fam })).json()).warning, undefined);
  const second = await (await call("/api/families", { method: "POST", body: { ...fam, name: "Dup Two", paypal_email: "Shared@example.com" } })).json();
  assert.match(second.warning, /already used by 1 other family/);
});

test("old webhook deliveries are refused before PayPal is asked", async () => {
  const res = await call("/api/webhooks/paypal", {
    method: "POST",
    key: null,
    body: { id: "WH-old", event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS" },
    headers: { "paypal-transmission-time": new Date(Date.now() - 2 * 3600_000).toISOString() },
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /too old/);
});

test("Postgres store saves text with NUL characters and lone surrogates, chain intact", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  const db = {
    query: (sql, params) => pg.query(sql, params),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params) })),
  };
  const pgStore = createPgStore({ db, seed: seedState });
  await pgStore.mutate((state, log) => {
    state.runs.push({ id: "run_nul", summary: "bad\u0000text \ud800 end" });
    log("run.drafted", "agent", { storm: "Ana\u0000" });
  });
  const s = await pgStore.read();
  assert.equal(s.runs[0].summary, "badtext � end");
  assert.equal(s.events[0].detail.storm, "Ana");
  assert.equal(verifyChain(s.events).ok, true);
});

// Last: it leaves this client's address locked out for the rest of the file.
test("wrong keys are throttled after 10 tries", async () => {
  // One wrong key was already sent by the cache-header test above.
  const statuses = [];
  for (let i = 0; i < 10; i++) statuses.push((await call("/api/state", { key: `guess-${i}` })).status);
  assert.deepEqual(statuses.slice(0, 9), Array(9).fill(401));
  assert.equal(statuses[9], 429);
  const wrong = await (await call("/api/state", { key: "x" })).json();
  assert.match(wrong.error, /too many/);
});
