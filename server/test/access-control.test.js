// Access control and rate limits: who a request is, what a key or link may
// lock out, the funder session, and the places that must not trust the client.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PAYPAL_CLIENT_ID = "test-id";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PAYPAL_WEBHOOK_ID = "WH-TEST";
delete process.env.PUBLIC_URL;
delete process.env.VERCEL;
delete process.env.VERCEL_URL;
delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
delete process.env.DEMO_FUNDERS;
delete process.env.DEMO_FARMERS;
delete process.env.PAYPAL_ENV;

const { createMemoryStore } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");
const { funderSessionSecret, signFunderToken } = await import("../src/funders.js");

const KEY = "right-key";
const store = createMemoryStore({ seed: seedState });
const staticDir = mkdtempSync(path.join(tmpdir(), "celerity-static-"));
writeFileSync(path.join(staticDir, "index.html"), "<!doctype html><title>app</title>");
let server, base;
const NO_BODY = Symbol("none");

// Each test names its own client address (via X-Forwarded-For with
// TRUST_PROXY_HOPS=1) so the per-client limiters never leak between tests.
let n = 0;
const ip = () => `10.9.${Math.floor(++n / 250)}.${n % 250}`;
const call = (p, { method = "GET", body = NO_BODY, key = KEY, headers = {} } = {}) =>
  fetch(`${base}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { "x-coordinator-key": key } : {}), ...headers },
    body: body === NO_BODY ? undefined : JSON.stringify(body),
  });
const session = (id, body = {}, headers = {}) => call(`/api/funders/${id}/session`, { method: "POST", key: null, body, headers });

before(async () => {
  process.env.TRUST_PROXY_HOPS = "1";
  const app = createApp({ store, coordinatorKey: KEY, staticDir });
  await new Promise((r) => (server = app.listen(0, "127.0.0.1", r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("a missing coordinator key is a plain 401 and never counts; the right key always works", async () => {
  const h = { "x-forwarded-for": ip() };
  for (let i = 0; i < 15; i++) assert.equal((await call("/api/state", { key: null, headers: h })).status, 401);
  assert.equal((await call("/api/state", { headers: h })).status, 200, "15 keyless loads did not lock the coordinator out");

  // Ten wrong keys lock out wrong keys, not the right one, which also resets the count.
  const wrong = [];
  for (let i = 0; i < 11; i++) wrong.push((await call("/api/state", { key: `guess-${i}`, headers: h })).status);
  assert.equal(wrong[10], 429);
  assert.equal((await call("/api/state", { headers: h })).status, 200);
  assert.equal((await call("/api/state", { key: "guess-again", headers: h })).status, 401, "the right key cleared the misses");
});

test("a valid farmer link is served however many wrong ones came from the same address", async () => {
  const token = (await store.read()).families.find((f) => f.link_token).link_token;
  const h = { "x-forwarded-for": ip() };
  const codes = [];
  for (let i = 0; i < 22; i++) codes.push((await call(`/api/me/${"x".repeat(24)}${i}`, { key: null, headers: h })).status);
  assert.equal(codes[0], 404);
  assert.equal(codes[21], 429, "guessing is still throttled");
  assert.equal((await call(`/api/me/${token}`, { key: null, headers: h })).status, 200);
});

test("the client address cannot be chosen with X-Forwarded-For", async () => {
  // TRUST_PROXY_HOPS=1: only the entry our own proxy appended counts.
  const real = ip();
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await call("/api/state", { key: `g${i}`, headers: { "x-forwarded-for": `1.1.1.${i}, ${real}` } })).status);
  assert.equal(codes[10], 429, "different spoofed first hops share one limiter");

  // No proxy configured: the header is ignored entirely, the socket address is used.
  delete process.env.TRUST_PROXY_HOPS;
  try {
    const seen = [];
    for (let i = 0; i < 12; i++) seen.push((await call("/api/state", { key: `h${i}`, headers: { "x-forwarded-for": `2.2.2.${i}` } })).status);
    assert.equal(seen[11], 429);

    // On Vercel the platform's x-real-ip is the client; a spoofed XFF is ignored.
    process.env.VERCEL = "1";
    const viaVercel = [];
    for (let i = 0; i < 11; i++) viaVercel.push((await call("/api/state", { key: `v${i}`, headers: { "x-real-ip": "203.0.113.7", "x-forwarded-for": `3.3.3.${i}, 203.0.113.7` } })).status);
    assert.equal(viaVercel[10], 429);
    assert.equal((await call("/api/state", { key: "other", headers: { "x-real-ip": "203.0.113.8" } })).status, 401, "another client is unaffected");
  } finally {
    delete process.env.VERCEL;
    process.env.TRUST_PROXY_HOPS = "1";
  }
});

test("a coordinator cannot sign as a system actor, and the name header is URI-decoded", async () => {
  const h = { "x-forwarded-for": ip() };
  for (const name of ["paypal", "PayPal", "Rules", "jev", "SYSTEM", "paypal-webhook", "farmer"]) {
    const res = await call("/api/families/fam_001", { method: "PATCH", body: { status: "active" }, headers: { ...h, "x-coordinator-name": name } });
    assert.equal(res.status, 400, name);
    assert.match((await res.json()).error, /reserved name/);
  }
  const ok = await call("/api/families/fam_001", {
    method: "PATCH",
    body: { status: "suspended" },
    headers: { ...h, "x-coordinator-name": encodeURIComponent("Ana Reyes-Peña ñ 山田") },
  });
  assert.equal(ok.status, 200);
  assert.equal((await store.read()).events.at(-1).actor, "Ana Reyes-Peña ñ 山田");
  // A malformed escape falls back to the raw value instead of failing.
  const raw = await call("/api/families/fam_001", { method: "PATCH", body: { status: "active" }, headers: { ...h, "x-coordinator-name": "100%" } });
  assert.equal(raw.status, 200);
});

test("funder pages need a session for that funder", async () => {
  const h = { "x-forwarded-for": ip() };
  const withToken = (token) => ({ ...h, ...(token ? { "x-funder-token": token } : {}) });
  const view = (id, token) => call(`/api/funders/${id}`, { key: null, headers: withToken(token) });
  const draft = (id, token) => call(`/api/funders/${id}/pool-drafts`, { method: "POST", key: null, body: { text: "x" }, headers: withToken(token) });
  const create = (id, token) => call(`/api/funders/${id}/pools`, { method: "POST", key: null, body: { name: "x" }, headers: withToken(token) });

  // No token.
  for (const r of [await view("fnd_pcic"), await draft("fnd_pcic"), await create("fnd_pcic")]) {
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: "sign in as this funder first" });
  }

  // Demo mode: signing in needs no code.
  const res = await session("fnd_pcic", {}, h);
  assert.equal(res.status, 200);
  const { token, expires_at } = await res.json();
  const ttl = Date.parse(expires_at) - Date.now();
  assert.ok(ttl > 11.9 * 3600_000 && ttl <= 12 * 3600_000);
  assert.equal((await view("fnd_pcic", token)).status, 200);

  // Funder A's token on funder B.
  assert.equal((await view("fnd_grf", token)).status, 401);
  assert.equal((await draft("fnd_grf", token)).status, 401);
  assert.equal((await create("fnd_grf", token)).status, 401);

  // Tampered: another signature, another id in the body, a truncated token.
  const [body, sig] = token.split(".");
  assert.equal((await view("fnd_pcic", `${body}.${sig.slice(0, -2)}AA`)).status, 401);
  const forgedBody = Buffer.from(`fnd_grf.${Date.now() + 3600_000}`).toString("base64url");
  assert.equal((await view("fnd_grf", `${forgedBody}.${sig}`)).status, 401);
  assert.equal((await view("fnd_pcic", body)).status, 401);

  // Expired, even though correctly signed with this server's secret.
  const secret = funderSessionSecret(KEY);
  assert.equal((await view("fnd_pcic", signFunderToken(secret, "fnd_pcic", Date.now() - 1000))).status, 401);
  assert.equal((await view("fnd_pcic", signFunderToken(secret, "fnd_pcic", Date.now() + 60_000))).status, 200);

  // The picker list stays public and carries display fields only.
  const list = await (await call("/api/funders", { key: null, headers: h })).json();
  assert.deepEqual(Object.keys(list.funders[0]).sort(), ["desc", "id", "initials", "name", "short"]);
  assert.equal((await session("fnd_nope", {}, h)).status, 404);
});

test("with DEMO_FUNDERS=0 a funder signs in only with its own access code", async () => {
  process.env.DEMO_FUNDERS = "0";
  process.env.FUNDER_CODES = JSON.stringify({ fnd_pcic: "pcic-secret" });
  try {
    const h = { "x-forwarded-for": ip() };
    assert.equal((await session("fnd_pcic", {}, h)).status, 401, "no code");
    assert.equal((await session("fnd_pcic", { code: "nope" }, h)).status, 401, "wrong code");
    assert.equal((await session("fnd_pcic", { code: "pcic-secret" }, { "x-forwarded-for": ip() })).status, 200);
    assert.equal((await session("fnd_grf", { code: "pcic-secret" }, h)).status, 401, "another funder's code");
    assert.equal((await session("fnd_grf", { code: "" }, h)).status, 401, "a funder with no code configured cannot sign in");

    // Wrong codes are throttled per client; the right one still works and clears the count.
    const g = { "x-forwarded-for": ip() };
    const wrong = [];
    for (let i = 0; i < 12; i++) wrong.push((await session("fnd_pcic", { code: `guess-${i}` }, g)).status);
    assert.equal(wrong[0], 401);
    assert.equal(wrong[11], 429);
    assert.equal((await session("fnd_pcic", { code: "pcic-secret" }, g)).status, 200);
  } finally {
    delete process.env.DEMO_FUNDERS;
    delete process.env.FUNDER_CODES;
  }
});

test("registering a family stores PAGASA's province name and refuses unknown ones", async () => {
  const h = { "x-forwarded-for": ip() };
  const fam = { name: "Reg Test", municipality: "Tondo", province: "NCR", household_size: 3, paypal_email: "reg@example.com" };
  const ok = await call("/api/families", { method: "POST", body: fam, headers: h });
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).province, "Metro Manila");
  assert.equal((await (await call("/api/families", { method: "POST", body: { ...fam, province: "Western Samar" }, headers: h })).json()).province, "Samar");

  const bad = await call("/api/families", { method: "POST", body: { ...fam, province: "Atlantis" }, headers: h });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "province is not a Philippine province we know: Atlantis");
});

test("coordinator pools use official province names and need nationwide to be explicit", async () => {
  const h = { "x-forwarded-for": ip() };
  const base_ = { name: "P", funder: "F" };
  const ok = await call("/api/pools", { method: "POST", body: { ...base_, provinces: ["NCR", "western samar", "Samar"] }, headers: h });
  assert.equal(ok.status, 201);
  assert.deepEqual((await ok.json()).provinces, ["Metro Manila", "Samar"]);

  const bad = await call("/api/pools", { method: "POST", body: { ...base_, provinces: ["Leyte", "Atlantis"] }, headers: h });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /not a Philippine province we know: Atlantis/);

  for (const body of [{ ...base_ }, { ...base_, provinces: [] }, { ...base_, provinces: [], nationwide: "yes" }]) {
    const res = await call("/api/pools", { method: "POST", body, headers: h });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "name at least one province, or set nationwide");
  }
  const all = await call("/api/pools", { method: "POST", body: { ...base_, provinces: [], nationwide: true }, headers: h });
  assert.equal(all.status, 201);
  assert.deepEqual((await all.json()).provinces, []);
});

test("demo farmer links are not served when PayPal is live", async () => {
  const h = { "x-forwarded-for": ip() };
  assert.ok((await (await call("/api/demo/farmers", { key: null, headers: h })).json()).farmers.length > 0);
  process.env.PAYPAL_ENV = "live";
  try {
    assert.deepEqual(await (await call("/api/demo/farmers", { key: null, headers: h })).json(), { farmers: [] });
  } finally {
    delete process.env.PAYPAL_ENV;
  }
});

test("the redirect address never follows a crafted Host header", async () => {
  const h = { "x-forwarded-for": ip() };
  const state = async (headers) => (await call("/api/state", { headers: { ...h, ...headers } })).status;
  // A real localhost host works (the request's own).
  assert.equal(await state({}), 200);
  // A forged X-Forwarded-Host is not consulted at all.
  assert.equal(await state({ "x-forwarded-host": "evil.example" }), 200);

  // Node's fetch won't forge Host, so use a raw request for that.
  const http = await import("node:http");
  const raw = (host) =>
    new Promise((resolve, reject) => {
      const r = http.request(`${base}/api/fund/cancel?token=nope`, { headers: { host } }, (res) => {
        res.resume();
        resolve({ status: res.statusCode, location: res.headers.location });
      });
      r.on("error", reject);
      r.end();
    });
  const evil = await raw("evil.example");
  assert.equal(evil.status, 500);
  const local = await raw("localhost:5173");
  assert.equal(local.location, "http://localhost:5173/#/public?funded=cancelled");

  process.env.VERCEL_URL = "celerity-abc.vercel.app";
  try {
    assert.equal((await raw("evil.example")).location, "https://celerity-abc.vercel.app/#/public?funded=cancelled");
  } finally {
    delete process.env.VERCEL_URL;
  }
  process.env.PUBLIC_URL = "https://relief.example/";
  try {
    assert.equal((await raw("evil.example")).location, "https://relief.example/#/public?funded=cancelled");
  } finally {
    delete process.env.PUBLIC_URL;
  }
});

test("the web server 404s files and dot paths, and serves the app for page routes", async () => {
  for (const p of ["/.git/config", "/assets/nope.js", "/.env", "/a/b.css", "/x/.hidden/y"]) {
    assert.equal((await call(p, { key: null })).status, 404, p);
  }
  for (const p of ["/", "/funder", "/console/funds"]) {
    const res = await call(p, { key: null });
    assert.equal(res.status, 200, p);
    assert.match(await res.text(), /<title>app<\/title>/);
  }
});
