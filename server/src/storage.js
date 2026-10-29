// Picks the store from the environment: Postgres when a database URL is set
// (Vercel + Neon), otherwise a JSON file under DATA_DIR for local dev.

import pg from "pg";
import { config } from "./config.js";
import { createMemoryStore, createPgStore, poolDb } from "./store.js";
import { seedState } from "./seed.js";

export function storeFromEnv() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    // Small pool: serverless instances are many, Neon's connection budget is not.
    const pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
    return createPgStore({ db: poolDb(pool), seed: seedState });
  }
  if (process.env.VERCEL) {
    throw new Error("No database: add Neon Postgres to this Vercel project (it sets DATABASE_URL), then redeploy.");
  }
  return createMemoryStore({ dir: config.dataDir, seed: seedState });
}
