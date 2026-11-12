// The chain proves the log agrees with itself; a checkpoint kept outside the
// app proves it wasn't cut short or rewritten. /api/chain/:seq lets anyone
// check one.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const { createMemoryStore } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");

const store = createMemoryStore({ seed: seedState });
let server, base;
before(async () => {
  await store.mutate((state, log) => {
    for (let i = 0; i < 3; i++) log("bulletin.received", "system", { title: `t${i}` }, null);
  });
  const app = createApp({ store, coordinatorKey: "k" });
  await new Promise((r) => (server = app.listen(0, "127.0.0.1", r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = async (path) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
};

test("a checkpoint noted earlier can be checked against the log, with no key", async () => {
  const pub = (await get("/api/public")).body;
  const { status, body } = await get(`/api/chain/${pub.chain.length - 1}`);
  assert.equal(status, 200);
  assert.equal(body.hash, pub.chain.head);
  assert.equal(body.head.hash, pub.chain.head);
});

test("a rewritten entry no longer matches its checkpoint; a cut-off one is gone", async () => {
  const { events } = await store.read();
  const noted = { seq: events.length - 1, hash: events.at(-1).hash };

  // Cut the newest entry off. The shorter log still verifies on its own.
  await store.mutate((state) => {
    state.events.pop();
  });
  const pub = (await get("/api/public")).body;
  assert.equal(pub.chain.ok, true, "truncation alone keeps the chain self-consistent");
  const gone = await get(`/api/chain/${noted.seq}`);
  assert.equal(gone.status, 404, "but the checkpoint shows it");

  // Append a different entry at the same number: the hash differs.
  await store.mutate((state, log) => log("bulletin.received", "system", { title: "replacement" }, null));
  const changed = await get(`/api/chain/${noted.seq}`);
  assert.equal(changed.status, 200);
  assert.notEqual(changed.body.hash, noted.hash);
});

test("a bad entry number is a 400", async () => {
  assert.equal((await get("/api/chain/-1")).status, 400);
  assert.equal((await get("/api/chain/abc")).status, 400);
});
