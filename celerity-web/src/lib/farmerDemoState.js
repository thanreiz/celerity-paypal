// Cash-outs and saved recipients are DEMO-ONLY, local state — the chain has
// no concept of "withdraw to GCash" (see lib/anchor.js). Without this, a
// page refresh mid-demo silently erases a farmer's cash-out history and
// spendable balance, which reads as a bug on stage even though the on-chain
// relief itself is untouched. Persisting to localStorage keeps the demo
// state stable across refreshes on the SAME browser — it's still clearly
// local/fake, just no longer fragile.
const CASHOUTS_KEY = "celerity.farmer.cashOuts";
const RECIPIENTS_KEY = "celerity.farmer.recipients";

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

export function loadCashOuts() {
  return load(CASHOUTS_KEY, []);
}

export function saveCashOuts(cashOuts) {
  save(CASHOUTS_KEY, cashOuts);
}

export function loadRecipients(seed) {
  return load(RECIPIENTS_KEY, seed);
}

export function saveRecipients(recipients) {
  save(RECIPIENTS_KEY, recipients);
}
