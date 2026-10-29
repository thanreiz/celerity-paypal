// Hard payout limits. The agent proposes; this module decides. Every draft
// is checked here when the agent drafts it and again when a coordinator
// approves, so neither a confused model nor a stale run can exceed policy.

// Amounts per payout currency. PHP is roughly USD x 50, rounded to sums a
// relief office would actually hand out.
const AMOUNTS = {
  USD: {
    // Base grant by PAGASA tropical cyclone wind signal level.
    signalBase: { 1: 0, 2: 20, 3: 40, 4: 60, 5: 80 },
    perExtraMember: 5, // for each household member beyond 2
    householdTopUpCap: 20,
    vulnerabilityTopUp: 10, // per flag: senior, pwd, infant, pregnant
    maxPerFamily: 120,
    maxPerRun: 1500,
  },
  PHP: {
    signalBase: { 1: 0, 2: 1000, 3: 2000, 4: 3000, 5: 4000 },
    perExtraMember: 250,
    householdTopUpCap: 1000,
    vulnerabilityTopUp: 500,
    maxPerFamily: 6000,
    maxPerRun: 75000,
  },
};

const currency = (process.env.PAYOUT_CURRENCY || "USD").toUpperCase();
if (!AMOUNTS[currency]) {
  throw new Error(`PAYOUT_CURRENCY "${currency}" has no policy amounts; use one of ${Object.keys(AMOUNTS).join(", ")}`);
}

export const POLICY = Object.freeze({
  currency,
  minSignal: 2,
  maxRecipientsPerRun: 40,
  ...AMOUNTS[currency],
  signalBase: Object.freeze({ ...AMOUNTS[currency].signalBase }),
});

export const VULNERABILITY_FLAGS = ["senior", "pwd", "infant", "pregnant"];

const norm = (s) => String(s || "").trim().toLowerCase();

export function stormKey(name) {
  return norm(name).replace(/^(super\s+)?(typhoon|tropical storm|severe tropical storm|tropical depression)\s+/, "");
}

/** Highest signal that covers the family's location, or 0. A province-wide
 * area (municipality null) covers every municipality in that province. */
export function signalFor(family, areas) {
  let best = 0;
  for (const a of areas || []) {
    if (norm(a.province) !== norm(family.province)) continue;
    if (a.municipality && norm(a.municipality) !== norm(family.municipality)) continue;
    best = Math.max(best, Number(a.signal_level) || 0);
  }
  return best;
}

export function maxAmountFor(family, signal, policy = POLICY) {
  const base = policy.signalBase[signal] || 0;
  if (base === 0) return 0;
  const extraMembers = Math.max(0, (family.household_size || 1) - 2);
  const household = Math.min(policy.householdTopUpCap, extraMembers * policy.perExtraMember);
  const flags = VULNERABILITY_FLAGS.filter((f) => family.vulnerability?.[f]).length;
  return Math.min(policy.maxPerFamily, base + household + flags * policy.vulnerabilityTopUp);
}

/** Families already paid (or in flight) for this storm. Failed or returned
 * items don't count, so a coordinator can retry them. */
export function paidFamilyIds(state, storm) {
  const key = stormKey(storm);
  const ids = new Set();
  if (!key) return ids;
  for (const b of state.batches) {
    if (stormKey(b.storm) !== key) continue;
    for (const it of b.items) {
      if (!["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED"].includes(it.status)) {
        ids.add(it.family_id);
      }
    }
  }
  return ids;
}

export function eligibility(state, family, run, policy = POLICY) {
  const reasons = [];
  if (!family) return { eligible: false, max_amount: 0, signal: 0, reasons: ["unknown family_id"] };
  if (family.status !== "active") reasons.push(`registration status is ${family.status}`);
  if (!family.paypal_email) reasons.push("no PayPal email on file");
  const signal = signalFor(family, run.areas);
  if (signal < policy.minSignal) {
    reasons.push(
      signal === 0
        ? `${family.municipality}, ${family.province} is not under any wind signal in this bulletin`
        : `signal ${signal} is below the minimum of ${policy.minSignal}`
    );
  }
  if (run.storm && paidFamilyIds(state, run.storm).has(family.id)) {
    reasons.push(`already paid for ${run.storm}`);
  }
  const max = reasons.length ? 0 : maxAmountFor(family, signal, policy);
  return { eligible: reasons.length === 0, max_amount: max, signal, reasons };
}

/** Validate one proposed draft against policy and the run's other drafts.
 * Returns a list of violations (empty = OK). */
export function checkDraft(state, run, draft, policy = POLICY) {
  const family = state.families.find((f) => f.id === draft.family_id);
  const el = eligibility(state, family, run, policy);
  const errors = [...el.reasons];
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("amount must be a positive number");
  else if (Math.round(amount * 100) !== amount * 100) errors.push("amount has more than 2 decimals");
  else if (el.eligible && amount > el.max_amount) {
    errors.push(`amount ${amount} exceeds this family's policy cap of ${el.max_amount}`);
  }
  const others = run.drafts.filter((d) => d.family_id !== draft.family_id);
  if (others.length + 1 > policy.maxRecipientsPerRun) {
    errors.push(`run would exceed ${policy.maxRecipientsPerRun} recipients`);
  }
  const total = others.reduce((s, d) => s + d.amount, 0) + (Number.isFinite(amount) ? amount : 0);
  if (total > policy.maxPerRun) errors.push(`run total ${total} would exceed the per-run cap of ${policy.maxPerRun}`);
  return errors;
}

export function runTotals(run) {
  return {
    recipients: run.drafts.length,
    amount: Math.round(run.drafts.reduce((s, d) => s + d.amount, 0) * 100) / 100,
  };
}
