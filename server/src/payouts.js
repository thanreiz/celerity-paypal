// Turning approved drafts into PayPal Payouts, and keeping payout status in
// sync from webhooks (push) or batch lookups (pull). Every change runs inside
// store.mutate, so it is applied whole or not at all.

import { POLICY, checkDraft } from "./policy.js";
import { createPayoutBatch, getPayoutBatch } from "./paypal.js";
import { newId } from "./store.js";

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export async function approveRun(store, runId, approver) {
  // The PayPal call happens inside the transaction: the state stays locked
  // until the batch is recorded, so a double click can't send twice. The
  // run-derived sender_batch_id is a second guard on PayPal's side.
  const outcome = await store.mutate(async (state, log) => {
    const run = state.runs.find((r) => r.id === runId);
    if (!run) throw new HttpError(404, "run not found");
    if (run.status !== "awaiting_approval") throw new HttpError(409, `run is ${run.status}, not awaiting approval`);
    if (!run.drafts.length) throw new HttpError(409, "run has no drafts");

    // Re-check every draft against current state: another run may have paid
    // a family, or a registration may have changed since the agent ran.
    const violations = [];
    for (const d of run.drafts) {
      const errs = checkDraft(state, run, d);
      if (errs.length) violations.push({ family_id: d.family_id, errors: errs });
    }
    if (violations.length) throw new HttpError(409, "drafts no longer pass policy", { violations });

    const senderBatchId = `celerity-${run.id}`;
    const items = run.drafts.map((d) => {
      const family = state.families.find((f) => f.id === d.family_id);
      return {
        family_id: d.family_id,
        receiver: family.paypal_email,
        amount: d.amount,
        currency: d.currency || POLICY.currency,
        note: `Celerity Relief: emergency cash aid for ${run.storm}. Stay safe.`,
        senderItemId: `${run.id}-${d.family_id}`,
      };
    });

    let res;
    try {
      res = await createPayoutBatch({
        senderBatchId,
        emailSubject: "You received emergency cash aid from Celerity Relief",
        emailMessage: `Cash aid for families affected by ${run.storm}. No action is needed to keep it; it is already yours.`,
        items,
      });
    } catch (e) {
      // Return instead of throw so the error entry is saved in the log.
      log("payout.error", "paypal", { message: e.message, debugId: e.debugId, details: e.details }, run.id);
      return { error: new HttpError(502, `PayPal rejected the payout: ${e.message}`, { debugId: e.debugId }) };
    }

    const now = new Date().toISOString();
    const batch = {
      id: newId("bat"),
      run_id: run.id,
      bulletin_id: run.bulletin_id,
      storm: run.storm,
      sender_batch_id: senderBatchId,
      payout_batch_id: res.batch_header.payout_batch_id,
      status: res.batch_header.batch_status,
      approved_by: approver,
      created_at: now,
      updated_at: now,
      items: items.map((it) => ({
        family_id: it.family_id,
        sender_item_id: it.senderItemId,
        receiver: it.receiver,
        amount: it.amount,
        currency: it.currency,
        status: "PENDING",
        payout_item_id: null,
        transaction_id: null,
        history: [{ at: now, status: "APPROVED", source: approver }],
      })),
    };
    state.batches.push(batch);
    run.status = "approved";
    run.batch_id = batch.id;
    run.approved_by = approver;
    run.approved_at = now;

    log(
      "run.approved",
      approver,
      { recipients: batch.items.length, amount: batch.items.reduce((s, i) => s + i.amount, 0), currency: POLICY.currency },
      run.id
    );
    log(
      "payout.batch_created",
      "paypal",
      { payout_batch_id: batch.payout_batch_id, sender_batch_id: senderBatchId, batch_status: batch.status },
      batch.id
    );
    return { batch };
  });
  if (outcome.error) throw outcome.error;
  return outcome.batch;
}

export function rejectRun(store, runId, actor, reason) {
  return store.mutate((state, log) => {
    const run = state.runs.find((r) => r.id === runId);
    if (!run) throw new HttpError(404, "run not found");
    if (run.status !== "awaiting_approval") throw new HttpError(409, `run is ${run.status}, not awaiting approval`);
    run.status = "rejected";
    run.rejected_by = actor;
    run.rejected_reason = reason || null;
    log("run.rejected", actor, { reason: reason || null }, run.id);
    return run;
  });
}

function setItemStatus(log, batch, item, status, source, extra = {}) {
  if (extra.payout_item_id) item.payout_item_id = extra.payout_item_id;
  if (extra.transaction_id) item.transaction_id = extra.transaction_id;
  if (extra.error) item.error = extra.error;
  if (!status || item.status === status) return false;
  item.status = status;
  item.history.push({ at: new Date().toISOString(), status, source });
  log(
    "payout.item_status",
    source,
    { family_id: item.family_id, status, payout_item_id: item.payout_item_id, transaction_id: item.transaction_id },
    batch.id
  );
  return true;
}

function setBatchStatus(log, batch, status, source) {
  if (!status || batch.status === status) return false;
  batch.status = status;
  batch.updated_at = new Date().toISOString();
  log("payout.batch_status", source, { payout_batch_id: batch.payout_batch_id, batch_status: status }, batch.id);
  return true;
}

/** Apply a GET /v1/payments/payouts/{id} response to our batch record. */
export function applyBatchSnapshot(log, batch, snapshot, source = "paypal-poll") {
  let changed = setBatchStatus(log, batch, snapshot.batch_header?.batch_status, source);
  for (const pi of snapshot.items || []) {
    const item = batch.items.find((i) => i.sender_item_id === pi.payout_item?.sender_item_id);
    if (!item) continue;
    changed =
      setItemStatus(log, batch, item, pi.transaction_status, source, {
        payout_item_id: pi.payout_item_id,
        transaction_id: pi.transaction_id,
        error: pi.errors?.message,
      }) || changed;
  }
  if (changed) batch.updated_at = new Date().toISOString();
  return changed;
}

export async function refreshBatch(store, batchId) {
  const before = (await store.read()).batches.find((b) => b.id === batchId);
  if (!before) throw new HttpError(404, "batch not found");
  // Ask PayPal outside the lock; apply the answer inside it.
  const snapshot = await getPayoutBatch(before.payout_batch_id);
  return store.mutate((state, log) => {
    const batch = state.batches.find((b) => b.id === batchId);
    applyBatchSnapshot(log, batch, snapshot, "paypal-poll");
    return batch;
  });
}

const ITEM_EVENT_STATUS = {
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": "SUCCESS",
  "PAYMENT.PAYOUTS-ITEM.FAILED": "FAILED",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": "UNCLAIMED",
  "PAYMENT.PAYOUTS-ITEM.BLOCKED": "BLOCKED",
  "PAYMENT.PAYOUTS-ITEM.RETURNED": "RETURNED",
  "PAYMENT.PAYOUTS-ITEM.REFUNDED": "REFUNDED",
  "PAYMENT.PAYOUTS-ITEM.HELD": "ONHOLD",
  "PAYMENT.PAYOUTS-ITEM.CANCELED": "CANCELED",
  "PAYMENT.PAYOUTS-ITEM.DENIED": "DENIED",
};

/** Apply a verified PayPal webhook event to state. Returns what happened. */
export function applyWebhookEvent(state, log, event) {
  if (state.webhookIds.includes(event.id)) return { duplicate: true };
  state.webhookIds.push(event.id);
  if (state.webhookIds.length > 1000) state.webhookIds.splice(0, state.webhookIds.length - 1000);

  const type = event.event_type || "";
  const r = event.resource || {};

  if (type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    const batch = state.batches.find((b) => b.payout_batch_id === r.batch_header?.payout_batch_id);
    if (!batch) return { ignored: "unknown batch" };
    setBatchStatus(log, batch, r.batch_header.batch_status, "paypal-webhook");
    return { batch: batch.id };
  }

  if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    const batch = state.batches.find((b) => b.payout_batch_id === r.payout_batch_id);
    if (!batch) return { ignored: "unknown batch" };
    const item = batch.items.find(
      (i) => i.sender_item_id === r.payout_item?.sender_item_id || i.payout_item_id === r.payout_item_id
    );
    if (!item) return { ignored: "unknown item" };
    setItemStatus(log, batch, item, r.transaction_status || ITEM_EVENT_STATUS[type], "paypal-webhook", {
      payout_item_id: r.payout_item_id,
      transaction_id: r.transaction_id,
      error: r.errors?.message,
    });
    return { batch: batch.id, item: item.family_id };
  }

  return { ignored: type };
}
