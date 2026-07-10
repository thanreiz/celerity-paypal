// Pool names/purposes are an APP-LEVEL label, chosen at creation and stored
// locally — the contract only ever knows pool numbers. Fallback derives a
// readable name from the pool's region so unlabeled pools still say something.
import { regionShort } from "./regions";

const KEY = "celerity.poolNames";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function poolName(pool) {
  return load()[String(pool.id)] || `${regionShort(pool.region)} Relief Pool`;
}

export function setPoolName(poolId, name) {
  if (!name?.trim()) return;
  const map = load();
  map[String(poolId)] = name.trim();
  localStorage.setItem(KEY, JSON.stringify(map));
}
