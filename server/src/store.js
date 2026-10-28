// JSON-file store. One process, one file, writes serialized through a
// promise chain so concurrent requests can't interleave a save.
//
// The evidence log is append-only and hash-chained: each entry commits to
// the previous entry's hash, so any edit or deletion breaks verifyChain().
// This replaces the on-chain audit trail of the original Celerity.

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";

const GENESIS = "0".repeat(64);

export function emptyState() {
  return { families: [], bulletins: [], runs: [], batches: [], events: [], webhookIds: [] };
}

export function hashEntry(entry) {
  const { hash, ...rest } = entry;
  return createHash("sha256").update(stableStringify(rest)).digest("hex");
}

// Key-sorted JSON so the hash doesn't depend on property insertion order.
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function verifyChain(events) {
  let prev = GENESIS;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.prevHash !== prev) return { ok: false, brokenAt: i, reason: "prevHash mismatch" };
    if (hashEntry(e) !== e.hash) return { ok: false, brokenAt: i, reason: "hash mismatch" };
    prev = e.hash;
  }
  return { ok: true, length: events.length, head: prev };
}

export function createStore({ dir, file = "state.json", seed } = {}) {
  const filePath = dir ? path.join(dir, file) : null;
  let state;
  if (filePath && existsSync(filePath)) {
    state = { ...emptyState(), ...JSON.parse(readFileSync(filePath, "utf8")) };
  } else {
    state = emptyState();
    if (seed) seed(state);
  }

  let saving = Promise.resolve();
  function persist() {
    if (!filePath) return Promise.resolve();
    const snapshot = JSON.stringify(state, null, 2);
    saving = saving.then(() => {
      mkdirSync(dir, { recursive: true });
      const tmp = `${filePath}.tmp`;
      writeFileSync(tmp, snapshot);
      renameSync(tmp, filePath);
    });
    return saving;
  }

  function log(type, actor, detail = {}, ref = null) {
    const prevHash = state.events.length ? state.events[state.events.length - 1].hash : GENESIS;
    const entry = {
      seq: state.events.length,
      id: randomUUID(),
      at: new Date().toISOString(),
      type,
      actor,
      ref,
      detail,
      prevHash,
    };
    entry.hash = hashEntry(entry);
    state.events.push(entry);
    return entry;
  }

  if (filePath && !existsSync(filePath)) persist();

  return {
    get state() {
      return state;
    },
    persist,
    log,
    flush: () => saving,
  };
}

export const newId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
