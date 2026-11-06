// The funder's side of Celerity: who the funders are, what each one sees in
// the Funder app, and the deterministic check every pool rule must pass
// before it exists. A funder writes a rule in plain words; the pool-rule
// agent (agents.js) turns it into the structured rule below; checkPoolRule
// decides whether that rule can be enforced. Money only moves under rules
// this file accepted.

import { POLICY, NOT_PAID, cents, norm } from "./policy.js";
import { PROVINCE_NAMES, lookupProvince } from "./parser.js";
import { poolLedger } from "./funding.js";

/** Demo funder institutions. Each has its own Funder app login. */
export const FUNDERS = [
  {
    id: "fnd_pcic",
    name: "Philippine Crop Insurance Corp.",
    short: "PCIC",
    desc: "State crop insurer, pays farmers in the regions it covers",
    initials: "PC",
  },
  {
    id: "fnd_grf",
    name: "Global Rice Foundation",
    short: "Global Rice",
    desc: "International foundation, funds relief nationwide",
    initials: "GR",
  },
];

export const funderById = (id) => FUNDERS.find((f) => f.id === id) || null;

/** The funder a pool belongs to: by id, or by name for pools made before ids. */
export function poolFunderId(pool) {
  if (pool.funder_id) return pool.funder_id;
  const name = norm(pool.funder);
  return FUNDERS.find((f) => name.startsWith(norm(f.name)) || name.startsWith(norm(f.short)))?.id || null;
}

export const RULE_LIMITS = Object.freeze({ maxPoolsPerFunder: 12, maxProvinces: 30, nameMax: 80, ruleTextMax: 600 });

/**
 * Why a structured pool rule can't be enforced, as a list (empty = OK).
 * Province names are normalized to PAGASA's spelling in `rule.provinces`.
 */
export function checkPoolRule(state, funderId, rule) {
  const problems = [];
  const name = typeof rule?.name === "string" ? rule.name.trim() : "";
  if (!name) problems.push("the pool needs a name");
  else if (name.length > RULE_LIMITS.nameMax) problems.push(`the name must be at most ${RULE_LIMITS.nameMax} characters`);

  if (!Array.isArray(rule?.provinces)) problems.push("provinces must be a list (empty means nationwide)");
  else if (rule.provinces.length > RULE_LIMITS.maxProvinces) problems.push(`at most ${RULE_LIMITS.maxProvinces} provinces`);
  else {
    for (const p of rule.provinces) {
      if (!lookupProvince(p)) problems.push(`"${String(p).slice(0, 60)}" is not a Philippine province PAGASA names`);
    }
  }

  const min = rule?.min_signal;
  if (!Number.isInteger(min) || min < POLICY.minSignal || min > 5) {
    problems.push(`min_signal must be a whole number from ${POLICY.minSignal} (the program minimum) to 5`);
  }
  if (!funderById(funderId)) problems.push("unknown funder");
  else if ((state.pools || []).filter((p) => poolFunderId(p) === funderId).length >= RULE_LIMITS.maxPoolsPerFunder) {
    problems.push(`a funder can have at most ${RULE_LIMITS.maxPoolsPerFunder} pools`);
  }
  return problems;
}

/** The rule as it will be stored, once checkPoolRule found nothing wrong. */
export function normalizedRule(rule) {
  return {
    name: rule.name.trim(),
    provinces: [...new Set(rule.provinces.map(lookupProvince))],
    min_signal: rule.min_signal,
  };
}

/** How many registered, active families each province has (for the agent). */
export function coverage(state) {
  const byProvince = new Map();
  for (const f of state.families) {
    if (f.status !== "active") continue;
    const p = lookupProvince(f.province) || f.province;
    byProvince.set(p, (byProvince.get(p) || 0) + 1);
  }
  return [...byProvince.entries()].map(([province, families]) => ({ province, families })).sort((a, b) => b.families - a.families);
}

export { PROVINCE_NAMES };

/** Everything the Funder app shows one funder: its pools and where the
 * money went. Other funders' pools never appear. No family names or emails. */
export function funderView(state, funderId) {
  const funder = funderById(funderId);
  const pools = poolLedger(state).filter((p) => poolFunderId(state.pools.find((x) => x.id === p.id)) === funderId);
  const ids = new Set(pools.map((p) => p.id));
  const famById = Object.fromEntries(state.families.map((f) => [f.id, f]));

  // One release per (batch, pool): the storm, the towns, how many families,
  // and how much of it PayPal has delivered.
  const releases = [];
  for (const b of state.batches) {
    const perPool = new Map();
    for (const it of b.items) {
      for (const share of it.funding || []) {
        if (!ids.has(share.pool_id)) continue;
        if (!perPool.has(share.pool_id)) perPool.set(share.pool_id, { amount: 0, delivered: 0, families: 0, failed: 0, towns: new Set() });
        const r = perPool.get(share.pool_id);
        if (NOT_PAID.has(it.status)) {
          r.failed += 1;
          continue;
        }
        r.amount += cents(share.amount);
        if (it.status === "SUCCESS") r.delivered += cents(share.amount);
        r.families += 1;
        const f = famById[it.family_id];
        if (f) r.towns.add(`${f.municipality}, ${f.province}`);
      }
    }
    const run = state.runs.find((r) => r.id === b.run_id);
    for (const [pool_id, r] of perPool) {
      releases.push({
        batch_id: b.id,
        pool_id,
        pool_name: pools.find((p) => p.id === pool_id)?.name,
        storm: b.storm,
        decided_by: run?.mode === "rules" ? "rules" : "agent + coordinator",
        at: b.created_at,
        status: b.status,
        payout_batch_id: b.payout_batch_id,
        families: r.families,
        failed: r.failed,
        towns: [...r.towns],
        amount: r.amount / 100,
        delivered: r.delivered / 100,
      });
    }
  }
  releases.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const sum = (k) => pools.reduce((s, p) => s + cents(p[k]), 0) / 100;
  return {
    funder,
    currency: POLICY.currency,
    totals: { contributed: sum("contributed"), committed: sum("committed"), available: sum("available"), delivered: sum("delivered") },
    pools,
    releases,
  };
}
