// Client-side claim unlock timers. The contract stores last_ts on-chain but
// exposes no getter, so the UI tracks when a payment landed (settle or claim)
// and shows the countdown Home already knows how to render. Session-scoped so
// a mid-demo refresh keeps the timer without lying forever across days.

const KEY = "celerity.claimCooldown.v1";

function readAll() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(all) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private browsing / quota */
  }
}

export function loadClaimCooldowns(role = "farmer") {
  const all = readAll();
  return all[role] && typeof all[role] === "object" ? all[role] : {};
}

export function saveClaimCooldowns(map, role = "farmer") {
  const all = readAll();
  all[role] = map;
  writeAll(all);
}

export function clearClaimCooldowns(role) {
  try {
    if (role) {
      const all = readAll();
      delete all[role];
      writeAll(all);
    } else {
      sessionStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Start / refresh the unlock clock for a pool after a payment landed. */
export function unlockAfterPeriod(map, poolId, claimPeriodSecs, paidAt = Date.now()) {
  const secs = Number(claimPeriodSecs) || 0;
  if (secs <= 0) return map;
  const key = String(poolId);
  return {
    ...map,
    [key]: { unlockAt: paidAt + secs * 1000, paidAt },
  };
}

export function isClaimNotDueYet(e) {
  const raw = String((e && (e.message || e)) || "");
  return /Error\(Contract, #17\)/.test(raw) || /Not due yet/i.test(raw);
}
