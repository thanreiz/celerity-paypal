import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createMemoryStore, createPgStore, verifyChain } from "../src/store.js";

test("evidence log is hash-chained and detects tampering", async () => {
  const store = createMemoryStore();
  await store.mutate((s, log) => {
    log("a", "x", { n: 1 });
    log("b", "y", { n: 2 }, "ref_1");
    log("c", "z", { n: 3 });
  });
  const { events } = await store.read();
  assert.deepEqual(verifyChain(events), { ok: true, length: 3, head: events[2].hash });

  const edited = structuredClone(events);
  edited[1].detail.n = 999;
  assert.equal(verifyChain(edited).ok, false);
  assert.equal(verifyChain(edited).brokenAt, 1);

  const deleted = structuredClone(events);
  deleted.splice(1, 1);
  assert.equal(verifyChain(deleted).ok, false);
});

test("a failed mutation saves nothing", async () => {
  const store = createMemoryStore({ seed: (s) => s.families.push({ id: "fam_1" }) });
  await assert.rejects(
    store.mutate((s, log) => {
      s.families.length = 0;
      log("oops", "x");
      throw new Error("boom");
    }),
    /boom/
  );
  const s = await store.read();
  assert.equal(s.families.length, 1);
  assert.equal(s.events.length, 0);
});

test("file store persists to disk and reloads without reseeding", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "celerity-"));
  try {
    let seeded = 0;
    const seed = (s) => {
      seeded++;
      s.families.push({ id: "fam_1" });
    };
    const a = createMemoryStore({ dir, seed });
    await a.mutate((s, log) => log("x", "y"));
    const b = createMemoryStore({ dir, seed });
    assert.equal(seeded, 1);
    const s = await b.read();
    assert.equal(s.families.length, 1);
    assert.equal(verifyChain(s.events).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function pgliteDb(pg) {
  return {
    query: (sql, params) => pg.query(sql, params),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params) })),
  };
}

test("Postgres store: seeds once, serializes writes, keeps the chain valid through jsonb", async () => {
  const pg = new PGlite();
  const seed = (s) => s.families.push({ id: "fam_1", name: "Maria" });
  const store = createPgStore({ db: pgliteDb(pg), seed });
  await store.read(); // first instance creates and seeds the table
  const again = createPgStore({ db: pgliteDb(pg), seed: (s) => s.families.push({ id: "should_not_seed" }) });

  // Concurrent read-modify-write from two "instances" must not lose updates.
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      (i % 2 ? store : again).mutate((s, log) => {
        s.counter = (s.counter || 0) + 1;
        log("tick", "test", { i, nested: { z: 1, a: [1, 2] } });
      })
    )
  );
  const s = await again.read();
  assert.equal(s.counter, 20);
  assert.deepEqual(s.families.map((f) => f.id), ["fam_1"]);
  assert.equal(s.events.length, 20);
  assert.equal(verifyChain(s.events).ok, true, "hashes survive jsonb key reordering");

  // A thrown error rolls the transaction back.
  await assert.rejects(store.mutate((st) => ((st.counter = 999), Promise.reject(new Error("nope")))), /nope/);
  assert.equal((await store.read()).counter, 20);

  // Deleting the row resets to the seed, even on an instance that already initialized.
  await pg.query("DELETE FROM celerity_state WHERE id = 1");
  const reset = await store.read();
  assert.equal(reset.counter, undefined);
  assert.deepEqual(reset.families.map((f) => f.id), ["fam_1"]);
  await pg.query("DELETE FROM celerity_state WHERE id = 1");
  await store.mutate((st) => (st.counter = 1));
  assert.equal((await again.read()).counter, 1);
});
