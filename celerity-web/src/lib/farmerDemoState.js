// Cash-outs and saved recipients are DEMO-ONLY, local state — the chain has
// no concept of "withdraw to GCash" (see lib/anchor.js). Without this, a
// page refresh mid-demo silently erases a farmer's cash-out history and
// spendable balance, which reads as a bug on stage even though the on-chain
// relief itself is untouched. Persisting to localStorage keeps the demo
// state stable across refreshes on the SAME browser — it's still clearly
// local/fake, just no longer fragile.
//
// Keys are scoped per farmer role so View-as (Ramon ↔ Nena) never mixes
// cash-out ledgers.

const cashKey = (role) => `celerity.farmer.${role || "farmer"}.cashOuts`;
const recipientsKey = (role) => `celerity.farmer.${role || "farmer"}.recipients`;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private browsing, quota) — demo state just stays
    // session-local for this load, same as before this feature existed.
  }
}

export function loadCashOuts(role = "farmer") {
  return load(cashKey(role), []);
}

export function saveCashOuts(cashOuts, role = "farmer") {
  save(cashKey(role), cashOuts);
}

export function loadRecipients(seed, role = "farmer") {
  return load(recipientsKey(role), seed);
}

export function saveRecipients(recipients, role = "farmer") {
  save(recipientsKey(role), recipients);
}

/** Wipe demo-only state for one farmer (or both demo faces). */
export function resetDemoState(role) {
  try {
    if (role) {
      localStorage.removeItem(cashKey(role));
      localStorage.removeItem(recipientsKey(role));
      // Legacy unscoped keys from before View-as.
      if (role === "farmer") {
        localStorage.removeItem("celerity.farmer.cashOuts");
        localStorage.removeItem("celerity.farmer.recipients");
      }
    } else {
      for (const r of ["farmer", "farmer2"]) {
        localStorage.removeItem(cashKey(r));
        localStorage.removeItem(recipientsKey(r));
      }
      localStorage.removeItem("celerity.farmer.cashOuts");
      localStorage.removeItem("celerity.farmer.recipients");
    }
  } catch {
    // storage unavailable — nothing persisted to clear
  }
}
