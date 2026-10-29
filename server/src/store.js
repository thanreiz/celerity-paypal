// State storage. The whole app state is one JSON document; every change goes
// through mutate(fn), which hands fn a private copy of the state and an
// event logger, then saves the copy only if fn finishes. A thrown error
// discards the copy, so a half-done change is never saved.
//
// Two backends with the same interface:
//   - memory (optionally mirrored to a JSON file): local dev and tests
//   - Postgres: production (Vercel + Neon). mutate() holds a row lock
//     (SELECT ... FOR UPDATE) for the whole change, so concurrent requests
//     on different serverless instances apply one at a time.
//
// The evidence log is append-only and hash-chained: each entry commits to
// the previous entry's hash, so any edit or deletion breaks verifyChain().

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

// Key-sorted JSON so the hash doesn't depend on property insertion order
// (Postgres jsonb does not preserve it).
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

/** Returns log(type, actor, detail, ref) that appends to state.events. */
export function eventLogger(state) {
  return (type, actor, detail = {}, ref = null) => {
    const prevHash = state.events.length ? state.events[state.events.length - 1].hash : GENESIS;
    const entry = {
      seq: state.events.length,
      id: randomUUID(),
      at: new Date().toISOString(),
      type,
      actor,
      ref,
      // Round-trip through JSON so the hash matches what storage gives back.
      detail: JSON.parse(JSON.stringify(detail)),
      prevHash,
    };
    entry.hash = hashEntry(entry);
    state.events.push(entry);
    return entry;
  };
}

function seeded(seed) {
  const state = emptyState();
  if (seed) seed(state);
  return state;
}

export function createMemoryStore({ dir, file = "state.json", seed } = {}) {
  const filePath = dir ? path.join(dir, file) : null;
  let state =
    filePath && existsSync(filePath)
      ? { ...emptyState(), ...JSON.parse(readFileSync(filePath, "utf8")) }
      : seeded(seed);

  function writeFile() {
    if (!filePath) return;
    mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, filePath);
  }
  if (filePath && !existsSync(filePath)) writeFile();

  let queue = Promise.resolve();
  return {
    kind: filePath ? "file" : "memory",
    async read() {
      await queue;
      return structuredClone(state);
    },
    mutate(fn) {
      const result = queue.then(async () => {
        const draft = structuredClone(state);
        const out = await fn(draft, eventLogger(draft));
        state = draft;
        writeFile();
        return out;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
}

/**
 * `db` is { query(sql, params) -> { rows }, transaction(fn(tx)) } so the
 * same code runs on node-postgres in production and PGlite in tests.
 */
export function createPgStore({ db, seed, table = "celerity_state" }) {
  let ready;
  function init() {
    ready ||= (async () => {
      await db.query(
        `CREATE TABLE IF NOT EXISTS ${table} (id int PRIMARY KEY, doc jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`
      );
      await db.query(`INSERT INTO ${table} (id, doc) VALUES (1, $1) ON CONFLICT (id) DO NOTHING`, [
        JSON.stringify(seeded(seed)),
      ]);
    })().catch((e) => {
      ready = null;
      throw e;
    });
    return ready;
  }

  // A warm instance remembers init() succeeded; if the row was deleted since
  // (a manual reset), run init again so it re-seeds.
  async function load() {
    await init();
    let { rows } = await db.query(`SELECT doc FROM ${table} WHERE id = 1`);
    if (!rows.length) {
      ready = null;
      await init();
      ({ rows } = await db.query(`SELECT doc FROM ${table} WHERE id = 1`));
    }
    return rows[0].doc;
  }

  return {
    kind: "postgres",
    async read() {
      return { ...emptyState(), ...(await load()) };
    },
    async mutate(fn) {
      await load();
      return db.transaction(async (tx) => {
        const { rows } = await tx.query(`SELECT doc FROM ${table} WHERE id = 1 FOR UPDATE`);
        const draft = { ...emptyState(), ...rows[0].doc };
        const out = await fn(draft, eventLogger(draft));
        await tx.query(`UPDATE ${table} SET doc = $1, updated_at = now() WHERE id = 1`, [JSON.stringify(draft)]);
        return out;
      });
    },
  };
}

/** Adapt a node-postgres Pool to the `db` interface createPgStore expects. */
export function poolDb(pool) {
  return {
    query: (sql, params) => pool.query(sql, params),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({ query: (sql, params) => client.query(sql, params) });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

export const newId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
