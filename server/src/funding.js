// Funders and earmarked pools: step 1 of the Celerity flow. A funder puts
// money into a pool earmarked for some provinces (or nationwide) through
// PayPal Checkout; every approved payout is split across the pools that
// cover the family, pro-rata by what each has left.
//
// Pools are a ledger over the one PayPal Business balance. Balances are
// always computed from contributions and payout allocations, never stored,
// so they can't drift from the record.

import { POLICY, NOT_PAID, cents, norm, signalFor } from "./policy.js";
import { newId } from "./store.js";

/** Pools that cover a family: earmarked for its province, or nationwide.
 * With a signal, only pools whose funder's rule pays at that signal or
 * higher (a pool without min_signal pays at any signal policy allows). */
export function poolsFor(state, family, signal = null) {
  if (!family) return [];
  return (state.pools || []).filter(
    (p) =>
      (!p.provinces?.length || p.provinces.some((prov) => norm(prov) === norm(family.province))) &&
      (signal == null || signal >= (Number(p.min_signal) || 0))
  );
}

/** The signal a draft is paid under: from the run's areas when it has them,
 * else none (no pool rule filters on it). */
const draftSignal = (family, run) => (family && Array.isArray(run.areas) ? signalFor(family, run.areas) : null);

/** { pool_id: { contributed, committed, available } } in pesos. Pending
 * checkouts don't count; payouts that never reached the family free their
 * money again. */
export function poolBalances(state) {
  const c = {};
  for (const p of state.pools || []) c[p.id] = { contributed: 0, committed: 0 };
  for (const k of state.contributions || []) {
    if (k.status === "completed" && c[k.pool_id]) c[k.pool_id].contributed += cents(k.amount);
  }
  for (const b of state.batches || []) {
    for (const it of b.items || []) {
      if (NOT_PAID.has(it.status)) continue;
      for (const f of it.funding || []) if (c[f.pool_id]) c[f.pool_id].committed += cents(f.amount);
    }
  }
  return Object.fromEntries(
    Object.entries(c).map(([id, v]) => [id, { contributed: v.contributed / 100, committed: v.committed / 100, available: (v.contributed - v.committed) / 100 }])
  );
}

/**
 * Split each draft of `run` across the pools that cover its family, in draft
 * order, pro-rata by each pool's remaining balance. Returns the split per
 * family and the drafts the pools can't cover.
 */
export function allocateRun(state, run) {
  const left = Object.fromEntries(Object.entries(poolBalances(state)).map(([id, b]) => [id, cents(b.available)]));
  const allocations = {};
  const shortfalls = [];
  for (const d of run.drafts) {
    const family = state.families.find((f) => f.id === d.family_id);
    const pools = poolsFor(state, family, draftSignal(family, run)).filter((p) => left[p.id] > 0);
    const want = cents(d.amount);
    const have = pools.reduce((s, p) => s + left[p.id], 0);
    if (want > have) {
      shortfalls.push({ family_id: d.family_id, province: family?.province, short: (want - have) / 100, available: have / 100 });
      continue;
    }
    // Floor each share, then hand the leftover centavos one by one to the
    // pools with the most room, so no pool goes below zero.
    const shares = pools.map((p) => ({ pool_id: p.id, c: Math.floor((want * left[p.id]) / have) }));
    let rest = want - shares.reduce((s, x) => s + x.c, 0);
    while (rest > 0) {
      const roomiest = shares.reduce((a, b) => (left[b.pool_id] - b.c > left[a.pool_id] - a.c ? b : a));
      roomiest.c += 1;
      rest -= 1;
    }
    allocations[d.family_id] = shares.filter((s) => s.c > 0).map((s) => ({ pool_id: s.pool_id, amount: s.c / 100 }));
    for (const s of shares) left[s.pool_id] -= s.c;
  }
  return { allocations, shortfalls };
}

/** Per-pool totals of a run's allocations, for previews and the log. */
export function poolTotals(allocations) {
  const t = {};
  for (const split of Object.values(allocations)) for (const s of split) t[s.pool_id] = (t[s.pool_id] || 0) + cents(s.amount);
  return Object.entries(t).map(([pool_id, c]) => ({ pool_id, amount: c / 100 }));
}

/** Why the pools can't fund this draft alongside the run's other drafts, or
 * null. The agent sees this as a policy refusal. */
export function fundingProblem(state, run, draft) {
  const others = run.drafts.filter((d) => d.family_id !== draft.family_id);
  const { shortfalls } = allocateRun(state, { areas: run.areas, drafts: [...others, draft] });
  const s = shortfalls.find((x) => x.family_id === draft.family_id);
  if (!s) return null;
  const family = state.families.find((f) => f.id === draft.family_id);
  if (!family) return null; // eligibility already reports an unknown family
  if (!poolsFor(state, family).length) return `no funding pool covers ${family.province}`;
  const signal = draftSignal(family, run);
  if (!poolsFor(state, family, signal).length) return `no funding pool covers ${family.province} at signal ${signal}`;
  return `funding pools for ${family.province} have only ${s.available} ${POLICY.currency} left for this run`;
}

/** Public view of every pool: who funded it, what it paid for, what's left.
 * No family names, ids or emails. */
export function poolLedger(state) {
  const balances = poolBalances(state);
  const famById = Object.fromEntries(state.families.map((f) => [f.id, f]));
  return (state.pools || []).map((p) => {
    const payouts = [];
    let delivered = 0;
    for (const b of state.batches || []) {
      let amount = 0;
      const towns = new Set();
      let farmers = 0;
      for (const it of b.items || []) {
        const share = (it.funding || []).find((f) => f.pool_id === p.id);
        if (!share || NOT_PAID.has(it.status)) continue;
        amount += cents(share.amount);
        farmers += 1;
        const f = famById[it.family_id];
        if (f) towns.add(`${f.municipality}, ${f.province}`);
        if (it.status === "SUCCESS") delivered += cents(share.amount);
      }
      if (farmers) {
        payouts.push({
          batch_id: b.id,
          storm: b.storm,
          created_at: b.created_at,
          status: b.status,
          payout_batch_id: b.payout_batch_id,
          families: farmers,
          places: [...towns],
          amount: amount / 100,
        });
      }
    }
    const contributions = (state.contributions || [])
      .filter((k) => k.pool_id === p.id && k.status === "completed")
      .map((k) => ({ funder_name: k.funder_name, amount: k.amount, source: k.source, at: k.at }));
    return {
      id: p.id,
      name: p.name,
      funder: p.funder,
      provinces: p.provinces,
      funder_id: p.funder_id || null,
      min_signal: Number(p.min_signal) || null,
      rule_text: p.rule_text || null,
      hazard: p.hazard,
      currency: POLICY.currency,
      ...balances[p.id],
      delivered: delivered / 100,
      contributions,
      payouts,
    };
  });
}

// --- PayPal Checkout contributions --------------------------------------------

export const FUND_LIMITS = { min: 100, max: 1_000_000 };

/** Record a checkout the funder is about to approve on PayPal. */
export function addPendingContribution(state, { pool, funderName, amount, orderId }) {
  const k = {
    id: newId("ctb"),
    pool_id: pool.id,
    funder_name: funderName,
    amount,
    currency: POLICY.currency,
    source: "paypal",
    status: "pending",
    order_id: orderId,
    capture_id: null,
    at: new Date().toISOString(),
  };
  state.contributions.push(k);
  // Abandoned checkouts are kept only for a while.
  const pending = state.contributions.filter((x) => x.status === "pending");
  if (pending.length > 500) state.contributions.splice(state.contributions.indexOf(pending[0]), 1);
  return k;
}

/**
 * Apply a PayPal capture (from the return redirect or the
 * PAYMENT.CAPTURE.COMPLETED webhook) to its pending contribution. Credits the
 * pool only for a completed capture of exactly the amount the funder chose.
 * Idempotent: a second report of the same capture changes nothing.
 */
export function completeContribution(state, log, { orderId, captureId, status, amount, currency, source }) {
  const k = state.contributions.find((x) => x.order_id === orderId);
  if (!k) return { ignored: "unknown order" };
  if (k.status === "completed") return { contribution: k.id, duplicate: true };
  if (status !== "COMPLETED") return { contribution: k.id, pending: status };
  if (cents(amount) !== cents(k.amount) || currency !== k.currency) {
    k.status = "mismatch";
    log("pool.funding_mismatch", source, { pool_id: k.pool_id, expected: k.amount, got: Number(amount), currency }, k.id);
    return { contribution: k.id, mismatch: true };
  }
  k.status = "completed";
  k.capture_id = captureId;
  k.at = new Date().toISOString();
  const pool = state.pools.find((p) => p.id === k.pool_id);
  log("pool.funded", source, { pool: pool?.name, funder_name: k.funder_name, amount: k.amount, currency: k.currency, capture_id: captureId }, k.pool_id);
  return { contribution: k.id, funded: true };
}
