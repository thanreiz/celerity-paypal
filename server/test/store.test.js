import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStore, verifyChain } from "../src/store.js";

test("evidence log is hash-chained and detects tampering", () => {
  const store = createStore();
  store.log("a", "x", { n: 1 });
  store.log("b", "y", { n: 2 }, "ref_1");
  store.log("c", "z", { n: 3 });
  const events = store.state.events;
  assert.deepEqual(verifyChain(events), { ok: true, length: 3, head: events[2].hash });

  const edited = structuredClone(events);
  edited[1].detail.n = 999;
  assert.equal(verifyChain(edited).ok, false);
  assert.equal(verifyChain(edited).brokenAt, 1);

  const deleted = structuredClone(events);
  deleted.splice(1, 1);
  assert.equal(verifyChain(deleted).ok, false);
});

test("store persists to disk and reloads without reseeding", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "celerity-"));
  try {
    let seeded = 0;
    const seed = (s) => {
      seeded++;
      s.families.push({ id: "fam_1" });
    };
    const a = createStore({ dir, seed });
    a.log("x", "y");
    await a.persist();
    const b = createStore({ dir, seed });
    assert.equal(seeded, 1);
    assert.equal(b.state.families.length, 1);
    assert.equal(verifyChain(b.state.events).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
