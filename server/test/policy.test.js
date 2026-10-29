import { test } from "node:test";
import assert from "node:assert/strict";
import { POLICY, signalFor, maxAmountFor, eligibility, checkDraft, stormKey, runTotals } from "../src/policy.js";
import { emptyState } from "../src/store.js";
import { seedState } from "../src/seed.js";

function setup() {
  const state = emptyState();
  seedState(state);
  const run = {
    storm: "Typhoon Dalisay",
    areas: [
      { province: "Catanduanes", municipality: null, signal_level: 4 },
      { province: "Albay", municipality: null, signal_level: 3 },
      { province: "Quezon", municipality: "Lucena City", signal_level: 1 },
    ],
    drafts: [],
  };
  return { state, run, fam: (id) => state.families.find((f) => f.id === id) };
}

test("province-wide area covers every municipality; highest signal wins", () => {
  const { fam } = setup();
  const areas = [
    { province: "Albay", municipality: null, signal_level: 2 },
    { province: "albay", municipality: "Daraga", signal_level: 3 },
  ];
  assert.equal(signalFor(fam("fam_006"), areas), 3); // Daraga
  assert.equal(signalFor(fam("fam_005"), areas), 2); // Legazpi City
  assert.equal(signalFor(fam("fam_015"), areas), 0); // Quezon
});

test("max amount adds household and vulnerability top-ups and respects the family cap", () => {
  const big = { household_size: 12, vulnerability: { senior: true, pwd: true, infant: true, pregnant: true } };
  assert.equal(maxAmountFor(big, 5), POLICY.maxPerFamily);
  assert.equal(maxAmountFor({ household_size: 2, vulnerability: {} }, 3), 40);
  assert.equal(maxAmountFor({ household_size: 6, vulnerability: { senior: true } }, 4), 60 + 20 + 10);
  assert.equal(maxAmountFor({ household_size: 6, vulnerability: { senior: true } }, 1), 0);
});

test("eligibility explains why a family is out", () => {
  const { state, run, fam } = setup();
  assert.equal(eligibility(state, fam("fam_001"), run).eligible, true);
  const signalOne = eligibility(state, fam("fam_015"), run);
  assert.equal(signalOne.eligible, false);
  assert.match(signalOne.reasons[0], /below the minimum/);
  const outside = eligibility(state, fam("fam_009"), run); // Sorsogon not in these areas
  assert.match(outside.reasons[0], /not under any wind signal/);
  const suspended = eligibility(state, fam("fam_013"), { ...run, areas: [{ province: "Camarines Sur", municipality: null, signal_level: 3 }] });
  assert.match(suspended.reasons.join(), /suspended/);
});

test("a family already paid for the same storm is not eligible again", () => {
  const { state, run, fam } = setup();
  state.batches.push({ storm: "DALISAY", items: [{ family_id: "fam_001", status: "SUCCESS" }] });
  const el = eligibility(state, fam("fam_001"), run);
  assert.equal(el.eligible, false);
  assert.match(el.reasons.join(), /already paid/);
  // A failed item does not block a retry.
  state.batches[0].items[0].status = "FAILED";
  assert.equal(eligibility(state, fam("fam_001"), run).eligible, true);
});

test("storm names normalize across bulletin wording", () => {
  assert.equal(stormKey("Typhoon Dalisay"), stormKey("DALISAY"));
  assert.equal(stormKey("Super Typhoon Dalisay"), "dalisay");
});

test("checkDraft rejects over-cap, unknown, and over-budget drafts", () => {
  const { state, run } = setup();
  const cap = eligibility(state, state.families[0], run).max_amount;
  assert.deepEqual(checkDraft(state, run, { family_id: "fam_001", amount: cap }), []);
  assert.match(checkDraft(state, run, { family_id: "fam_001", amount: cap + 1 }).join(), /exceeds/);
  assert.match(checkDraft(state, run, { family_id: "fam_999", amount: 10 }).join(), /unknown family/);
  assert.match(checkDraft(state, run, { family_id: "fam_001", amount: 10.555 }).join(), /decimals/);
  assert.match(checkDraft(state, run, { family_id: "fam_001", amount: -5 }).join(), /positive/);

  run.drafts = [{ family_id: "fam_002", amount: POLICY.maxPerRun - 10 }];
  assert.match(checkDraft(state, run, { family_id: "fam_001", amount: 20 }).join(), /per-run cap/);
});

test("storm names match across categories, brackets and punctuation", () => {
  assert.equal(stormKey("Super Typhoon Dalisay (Haikui)"), stormKey("DALISAY"));
  assert.equal(stormKey("Typhoon Dalisay."), "dalisay");
  assert.equal(stormKey("(Haikui)"), "");
});

test("no storm name means nobody is eligible yet", () => {
  const { state, run, fam } = setup();
  run.storm = "  ";
  const el = eligibility(state, fam("fam_001"), run);
  assert.equal(el.eligible, false);
  assert.match(el.reasons.join(), /no storm name/);
});

test("a family paid in the last 7 days is blocked under any storm name; canceled payouts don't count", () => {
  const { state, run, fam } = setup();
  const now = new Date().toISOString();
  state.batches.push({ storm: "Typhoon Haikui", created_at: now, items: [{ family_id: "fam_001", status: "SUCCESS" }] });
  assert.match(eligibility(state, fam("fam_001"), run).reasons.join(), /last 7 days/);
  state.batches[0].items[0].status = "CANCELED";
  assert.equal(eligibility(state, fam("fam_001"), run).eligible, true);
  state.batches[0].items[0].status = "SUCCESS";
  state.batches[0].created_at = new Date(Date.now() - 8 * 86_400_000).toISOString();
  assert.equal(eligibility(state, fam("fam_001"), run).eligible, true);
});

test("two-decimal amounts are exact and totals add up in centavos", () => {
  const { state, run } = setup();
  for (const amount of [19.99, 0.07, 0.29, 1.1]) {
    assert.deepEqual(checkDraft(state, run, { family_id: "fam_001", amount }), [], String(amount));
  }
  run.drafts = [{ family_id: "fam_002", amount: 0.1 }, { family_id: "fam_003", amount: 0.2 }];
  assert.equal(runTotals(run).amount, 0.3);
});
