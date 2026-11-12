// A pool is credited what PayPal actually paid us: the capture's net amount,
// after PayPal's fee. Planning payouts against the gross figure would let a
// batch fail for want of money the account never had.

import { test } from "node:test";
import assert from "node:assert/strict";

const { emptyState, eventLogger } = await import("../src/store.js");
const { seedState } = await import("../src/seed.js");
const { poolBalances, poolLedger, completeContribution, reverseContribution, addPendingContribution, creditedCents } = await import("../src/funding.js");
const { feeOf } = await import("../src/paypal.js");

function fresh() {
  const state = emptyState();
  seedState(state);
  state.contributions = [];
  return { state, log: eventLogger(state), pool: state.pools[0] };
}

test("a capture is credited net of PayPal's fee, and the fee is on the record", () => {
  const { state, log, pool } = fresh();
  addPendingContribution(state, { pool, funderName: "Bayanihan Fund", amount: 1000, orderId: "O1" });
  const capture = { id: "C1", status: "COMPLETED", amount: { value: "1000.00", currency_code: state.contributions[0].currency }, seller_receivable_breakdown: { gross_amount: { value: "1000.00" }, paypal_fee: { value: "39.40" }, net_amount: { value: "960.60" } } };
  assert.deepEqual(feeOf(capture), { net: "960.60", fee: "39.40" });
  const r = completeContribution(state, log, { orderId: "O1", captureId: "C1", status: "COMPLETED", amount: "1000.00", currency: capture.amount.currency_code, ...feeOf(capture), source: "paypal" });
  assert.equal(r.funded, true);
  assert.equal(poolBalances(state)[pool.id].contributed, 960.6);
  assert.equal(poolBalances(state)[pool.id].available, 960.6);
  const k = state.contributions[0];
  assert.equal(k.fee, 39.4);
  assert.equal(k.net, 960.6);
  const funded = state.events.find((e) => e.type === "pool.funded");
  assert.equal(funded.detail.fee, 39.4);
  assert.equal(funded.detail.net, 960.6);
  const row = poolLedger(state).find((p) => p.id === pool.id).contributions[0];
  assert.deepEqual([row.amount, row.paid, row.fee], [960.6, 1000, 39.4]);
});

test("only a fee is given: net is worked out; neither given: face value", () => {
  const { state, log, pool } = fresh();
  const cur = (x) => ({ currency: state.contributions.at(-1).currency, ...x });
  addPendingContribution(state, { pool, funderName: "A", amount: 500, orderId: "O1" });
  completeContribution(state, log, cur({ orderId: "O1", captureId: "C1", status: "COMPLETED", amount: "500.00", fee: "20.00", net: null, source: "paypal" }));
  addPendingContribution(state, { pool, funderName: "B", amount: 300, orderId: "O2" });
  completeContribution(state, log, cur({ orderId: "O2", captureId: "C2", status: "COMPLETED", amount: "300.00", source: "paypal" }));
  assert.equal(poolBalances(state)[pool.id].contributed, 780);
});

test("a fee breakdown that makes no sense is ignored rather than trusted", () => {
  const { state, log, pool } = fresh();
  addPendingContribution(state, { pool, funderName: "A", amount: 500, orderId: "O1" });
  const currency = state.contributions[0].currency;
  // A net above the gross, a negative fee: fall back to face value.
  completeContribution(state, log, { orderId: "O1", captureId: "C1", status: "COMPLETED", amount: "500.00", currency, net: "900.00", fee: "-5", source: "paypal" });
  assert.equal(poolBalances(state)[pool.id].contributed, 500);
});

test("a refund comes off the net, and the pool never goes below zero for it", () => {
  const { state, log, pool } = fresh();
  addPendingContribution(state, { pool, funderName: "A", amount: 1000, orderId: "O1" });
  const currency = state.contributions[0].currency;
  completeContribution(state, log, { orderId: "O1", captureId: "C1", status: "COMPLETED", amount: "1000.00", currency, net: "960.00", fee: "40.00", source: "paypal" });
  reverseContribution(state, log, { type: "PAYMENT.CAPTURE.REFUNDED", captureIds: ["C1"], refundId: "R1", amount: "200.00", currency, source: "paypal-webhook" });
  assert.equal(poolBalances(state)[pool.id].contributed, 760);
  reverseContribution(state, log, { type: "PAYMENT.CAPTURE.REFUNDED", captureIds: ["C1"], refundId: "R2", amount: "800.00", currency, source: "paypal-webhook" });
  assert.equal(poolBalances(state)[pool.id].contributed, 0);
  assert.equal(creditedCents(state.contributions[0]), 0);
});
