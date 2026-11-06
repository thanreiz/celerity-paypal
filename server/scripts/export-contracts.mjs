// Writes contracts/fixtures/*.json: inputs and the answers the Node rules
// give for them. The Java core (core/) must give the same answers; its
// ParityTest reads these files. server/test/contracts.test.js fails when the
// committed files are out of date, so the two can't drift silently.
//
//   node scripts/export-contracts.mjs            # writes ../contracts/fixtures
//   node scripts/export-contracts.mjs <dir>      # writes somewhere else
//
// Runs once per payout currency in a child process, because the policy
// module reads PAYOUT_CURRENCY when it loads.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] || path.join(here, "../../contracts/fixtures"));

if (!process.env.CONTRACTS_CURRENCY) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const currency of ["USD", "PHP"]) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), outDir], {
      env: { ...process.env, CONTRACTS_CURRENCY: currency, PAYOUT_CURRENCY: currency, SEED_RECEIVER_EMAILS: "" },
      stdio: "inherit",
    });
    if (r.status !== 0) process.exit(r.status || 1);
  }
  process.exit(0);
}

const currency = process.env.CONTRACTS_CURRENCY;
const { checkDraft, eligibility, runTotals, POLICY } = await import("../src/policy.js");
const { allocateRun, poolBalances } = await import("../src/funding.js");
const { emptyState, hashEntry, verifyChain } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");

// Fixed clock for every case. Batch dates are either long past (2000) or far
// in the future (2099), so the 7-day cooldown gives the same answer whenever
// this runs, and Java gets the same answer at this "now".
const NOW = "2026-11-15T00:00:00.000Z";
const OLD = "2000-01-01T00:00:00.000Z";
const RECENT = "2099-01-01T00:00:00.000Z";

function baseState() {
  const s = emptyState();
  seedState(s);
  // Only what the rules read, with nothing random or time-dependent.
  for (const f of s.families) {
    delete f.link_token;
    f.registered_at = OLD;
  }
  for (const p of s.pools) p.created_at = OLD;
  for (const c of s.contributions) c.at = OLD;
  return { families: s.families, batches: [], pools: s.pools, contributions: s.contributions };
}

const DALISAY = {
  storm: "Typhoon Dalisay",
  areas: [
    { province: "Catanduanes", municipality: null, signal_level: 4 },
    { province: "Albay", municipality: null, signal_level: 3 },
    { province: "Quezon", municipality: "Lucena City", signal_level: 1 },
  ],
  drafts: [],
};
const run = (extra = {}) => ({ ...structuredClone(DALISAY), ...extra });
const batch = (storm, created_at, items) => ({ id: `bat_${storm.length}`, storm, created_at, items });
const paid = (family_id, status = "SUCCESS", funding) => ({ family_id, status, ...(funding ? { funding } : {}) });

const cases = [];
const add = (name, op, input, expected) => cases.push({ name, op, input: { currency, now: NOW, ...input }, expected });

const capOf = (state, id, r = run()) => eligibility(state, state.families.find((f) => f.id === id), r).max_amount;

// --- policy/check-draft ---------------------------------------------------------
{
  const s = baseState();
  const r = run();
  const draftCase = (name, state, rr, draft) => add(name, "policy/check-draft", { state, run: rr, draft }, { errors: checkDraft(state, rr, draft) });
  const cap = capOf(s, "fam_001");
  draftCase("draft at the family cap", s, r, { family_id: "fam_001", amount: cap });
  draftCase("draft over the cap", s, r, { family_id: "fam_001", amount: cap + 1 });
  draftCase("unknown family", s, r, { family_id: "fam_999", amount: 10 });
  draftCase("three decimals", s, r, { family_id: "fam_001", amount: 10.555 });
  draftCase("negative amount", s, r, { family_id: "fam_001", amount: -5 });
  draftCase("amount as a string", s, r, { family_id: "fam_001", amount: "12" });
  draftCase("19.99 is two decimals", s, r, { family_id: "fam_001", amount: 19.99 });
  draftCase("0.07 is two decimals", s, r, { family_id: "fam_002", amount: 0.07 });
  draftCase("suspended family", s, run({ areas: [...DALISAY.areas, { province: "Camarines Sur", municipality: null, signal_level: 3 }] }), {
    family_id: "fam_013",
    amount: 10,
  });
  draftCase("outside every signal area", s, r, { family_id: "fam_009", amount: 10 });
  draftCase("below the minimum signal", s, r, { family_id: "fam_015", amount: 10 });
  draftCase("run without a storm name", s, run({ storm: "  " }), { family_id: "fam_001", amount: 10 });

  const alias = { ...baseState(), batches: [batch("Super Typhoon DALISAY (Haikui)", OLD, [paid("fam_001")])] };
  draftCase("already paid under another spelling of the storm", alias, r, { family_id: "fam_001", amount: 10 });
  const cooldown = { ...baseState(), batches: [batch("Typhoon Other", RECENT, [paid("fam_001")])] };
  draftCase("paid for another storm within 7 days", cooldown, r, { family_id: "fam_001", amount: 10 });
  const old = { ...baseState(), batches: [batch("Typhoon Other", OLD, [paid("fam_001")])] };
  draftCase("paid for another storm long ago", old, r, { family_id: "fam_001", amount: 10 });
  const canceled = { ...baseState(), batches: [batch("Typhoon Dalisay", RECENT, [paid("fam_001", "CANCELED")])] };
  draftCase("a canceled payout allows a retry", canceled, r, { family_id: "fam_001", amount: 10 });

  draftCase("per-run cap", s, run({ drafts: [{ family_id: "fam_002", amount: POLICY.maxPerRun - 5 }] }), { family_id: "fam_001", amount: 10 });
  draftCase(
    "recipient cap",
    s,
    run({ drafts: Array.from({ length: POLICY.maxRecipientsPerRun }, (_, i) => ({ family_id: `x_${i}`, amount: 1 })) }),
    { family_id: "fam_001", amount: 1 }
  );

  const dry = baseState();
  dry.contributions = dry.contributions.map((c) => ({ ...c, amount: 5 }));
  draftCase("pools too small", dry, run({ drafts: [{ family_id: "fam_002", amount: 6 }] }), { family_id: "fam_001", amount: 6 });
  const noPool = baseState();
  noPool.pools = [{ ...noPool.pools[0], provinces: ["Albay"] }];
  noPool.contributions = [noPool.contributions[0]];
  draftCase("no pool covers the province", noPool, r, { family_id: "fam_001", amount: 10 });
}

// --- policy/eligibility ----------------------------------------------------------
{
  const s = baseState();
  for (const id of ["fam_001", "fam_006", "fam_013", "fam_015", "fam_404"]) {
    const family = s.families.find((f) => f.id === id);
    add(`eligibility of ${id}`, "policy/eligibility", { state: s, run: run(), family_id: id }, eligibility(s, family, run()));
  }
  const weird = baseState();
  weird.families[0] = { ...weird.families[0], household_size: 0, vulnerability: { senior: "yes", pwd: 0 } };
  add("household size 0 and odd flag values", "policy/eligibility", { state: weird, run: run(), family_id: "fam_001" }, eligibility(weird, weird.families[0], run()));
}

// --- policy/run-totals -----------------------------------------------------------
add("totals add up in centavos", "policy/run-totals", { run: { drafts: [{ amount: 0.1 }, { amount: 0.2 }, { amount: 19.99 }] } }, runTotals({ drafts: [{ amount: 0.1 }, { amount: 0.2 }, { amount: 19.99 }] }));

// --- funding/allocate and balances -------------------------------------------------
{
  const allocCase = (name, state, rr) => add(name, "funding/allocate", { state, run: rr }, allocateRun(state, rr));
  const s = baseState();
  allocCase("one family, both pools pro-rata", s, run({ drafts: [{ family_id: "fam_002", amount: 70 }] }));
  allocCase("Quezon is covered only by the nationwide pool", s, run({ drafts: [{ family_id: "fam_015", amount: 20 }] }));
  allocCase(
    "many drafts drain pools in order",
    s,
    run({ drafts: s.families.slice(0, 8).map((f, i) => ({ family_id: f.id, amount: [333.33, 250, 0.01, 75.5, 99.99, 120, 1, 60][i] })) })
  );
  const odd = baseState();
  odd.contributions = [
    { pool_id: odd.pools[0].id, amount: 0.02, status: "completed" },
    { pool_id: odd.pools[1].id, amount: 0.01, status: "completed" },
  ];
  allocCase("leftover centavos", odd, run({ drafts: [{ family_id: "fam_001", amount: 0.03 }] }));
  allocCase("shortfall names the family", odd, run({ drafts: [{ family_id: "fam_001", amount: 1 }, { family_id: "fam_999", amount: 1 }] }));

  const spent = baseState();
  spent.contributions.push({ pool_id: spent.pools[1].id, amount: 999, status: "pending" });
  spent.batches = [
    batch("Typhoon Dalisay", OLD, [
      paid("fam_001", "SUCCESS", [{ pool_id: spent.pools[0].id, amount: 60.5 }, { pool_id: spent.pools[1].id, amount: 30.25 }]),
      paid("fam_002", "FAILED", [{ pool_id: spent.pools[0].id, amount: 40 }]),
      paid("fam_003", "UNCLAIMED", [{ pool_id: "pool_gone", amount: 10 }]),
    ]),
  ];
  add("balances skip failed payouts and pending checkouts", "funding/balances", { state: spent }, poolBalances(spent));
  allocCase("allocation after earlier payouts", spent, run({ drafts: [{ family_id: "fam_004", amount: 45 }] }));
}

// --- ledger/verify -----------------------------------------------------------------
{
  // Entries like the evidence log writes, with fixed ids and times so the
  // file is stable, chained with the real hashEntry.
  const entries = [
    ["run.drafted", "agent", { storm: "Typhoon Dalisay", recipients: 13, amount: 39500.5, currency, areas: 9 }, "run_1"],
    ["pool.funded", "paypal", { pool: "PCIC Bicol typhoon pool", funder_name: 'Bayanihan "Relief" Fund\nñ ✓ 🌀', amount: 500, currency }, "pool_x"],
    ["payout.submitting", "Ana Reyes", { recipients: 2, amount: 0.3, pools: [{ pool_id: "a", amount: 0.1 }, { pool_id: "b", amount: 0.2 }], note: null }, "bat_1"],
  ];
  const events = [];
  let prev = "0".repeat(64);
  entries.forEach(([type, actor, detail, ref], seq) => {
    const entry = { seq, id: `evt_${seq}`, at: OLD, type, actor, ref, detail, prevHash: prev };
    entry.hash = hashEntry(entry);
    events.push(entry);
    prev = entry.hash;
  });
  add("a valid chain", "ledger/verify", { events }, verifyChain(events));
  const edited = structuredClone(events);
  edited[1].detail.amount = 5000;
  add("an edited entry breaks the chain", "ledger/verify", { events: edited }, verifyChain(edited));
  const removed = structuredClone(events);
  removed.splice(1, 1);
  add("a deleted entry breaks the chain", "ledger/verify", { events: removed }, verifyChain(removed));
  add("an empty log", "ledger/verify", { events: [] }, verifyChain([]));
}

for (const c of cases) {
  const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  writeFileSync(path.join(outDir, `${currency.toLowerCase()}-${c.op.replace("/", "-")}-${slug}.json`), JSON.stringify(c, null, 2) + "\n");
}
console.log(`${currency}: ${cases.length} contract cases`);
