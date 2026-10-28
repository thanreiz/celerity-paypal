import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PAYOUT_CURRENCY = "php";
const { POLICY, maxAmountFor } = await import("../src/policy.js");

test("PHP payouts use peso-scale limits", () => {
  assert.equal(POLICY.currency, "PHP");
  assert.equal(POLICY.maxPerFamily, 6000);
  // Signal 4, household of 6, one senior: 3000 + 4*250 (capped 1000) + 500
  assert.equal(maxAmountFor({ household_size: 6, vulnerability: { senior: true } }, 4), 4500);
  assert.equal(maxAmountFor({ household_size: 2, vulnerability: {} }, 1), 0);
});
