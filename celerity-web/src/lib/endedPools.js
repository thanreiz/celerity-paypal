// "Ended" isn't a real on-chain PoolStatus (the contract only knows Active /
// Paused / Exhausted) — a formally-ended pool is stored on-chain as Paused,
// same as a pool the funder paused for any other reason. The distinction
// ("this typhoon is over, closed on purpose" vs. "temporarily paused") is
// app-level, so it's tracked locally, same pattern as lib/poolNames.js.
const KEY = "celerity.endedPools";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function saveSet(ids) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable — the pool still shows as Paused, just without
    // the Ended distinction for this session.
  }
}

export function isEnded(poolId) {
  return load().includes(String(poolId));
}

export function markEnded(poolId) {
  const ids = new Set(load());
  ids.add(String(poolId));
  saveSet(ids);
}

/** Resume un-ends a pool too — an Active pool can't also read as Ended. */
export function clearEnded(poolId) {
  const ids = new Set(load());
  ids.delete(String(poolId));
  saveSet(ids);
}
