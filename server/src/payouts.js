// Turning approved drafts into PayPal Payouts, and keeping payout status in
// sync from webhooks (push) or batch lookups (pull). Every state change runs
// inside store.mutate, so it is applied whole or not at all; PayPal is always
// called outside it.

import { POLICY } from "./policy.js";
import { PayPalError, createPayoutBatch, getPayoutBatch } from "./paypal.js";
import { newId } from "./store.js";
import { completeContribution, poolTotals } from "./funding.js";
// The money rules at approval go through the core client, which can hand
// them to the Java core (CORE_MODE); off by default.
import * as core from "./core.js";

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

// A submission younger than this may still be in flight on another instance.
const RESUME_AFTER_MS = 30_000;

// PayPal answered and refused: nothing was created, the run can be retried.
// Anything else (timeout, network, 5xx) leaves the outcome unknown.
const definiteRejection = (e) => e instanceof PayPalError && e.status >= 400 && e.status < 500 && e.status !== 409 && e.status !== 429;

/**
 * Approve a run and send its payouts, in three steps so no database lock is
 * held while PayPal is called:
 *   1. claim: re-check policy, record the batch as SUBMITTING (its items count
 *      as paid from now on, so no other run can re-draft these families);
 *   2. call PayPal with no lock held;
 *   3. record PayPal's answer.
 * If the process dies or PayPal's answer is lost between 1 and 3, the batch
 * stays SUBMITTING and the next Approve resumes it with the same
 * PayPal-Request-Id, which PayPal answers idempotently instead of paying twice.
 */
export async function approveRun(store, runId, approver) {
  const claim = await store.mutate(async (state, log) => {
    const run = state.runs.find((r) => r.id === runId);
    if (!run) throw new HttpError(404, "run not found");

    if (run.status === "submitting") {
      const batch = state.batches.find((b) => b.id === run.batch_id);
      if (Date.now() - Date.parse(batch.submitted_at) < RESUME_AFTER_MS) {
        throw new HttpError(409, "this run's payouts are being submitted to PayPal");
      }
      batch.submitted_at = new Date().toISOString();
      log("payout.resumed", approver, { attempt: batch.attempt }, batch.id);
      return { batch: structuredClone(batch), run: structuredClone(run) };
    }

    if (run.status !== "awaiting_approval") throw new HttpError(409, `run is ${run.status}, not awaiting approval`);
    if (!run.drafts.length) throw new HttpError(409, "run has no drafts");

    // Re-check every draft against current state: another run may have paid
    // a family, or a registration may have changed since the agent ran.
    const violations = [];
    for (const d of run.drafts) {
      const errs = await core.checkDraft(state, run, d);
      if (errs.length) violations.push({ family_id: d.family_id, errors: errs });
    }
    if (violations.length) throw new HttpError(409, "drafts no longer pass policy", { violations });

    // Split every payout across the funders' pools that cover the family. A
    // pool another run drained since drafting stops the approval here.
    const { allocations, shortfalls } = await core.allocateRun(state, run);
    if (shortfalls.length) {
      throw new HttpError(409, "drafts no longer pass policy", {
        violations: shortfalls.map((x) => ({
          family_id: x.family_id,
          errors: [`funding pools for ${x.province} are short by ${x.short} ${POLICY.currency}`],
        })),
      });
    }

    const now = new Date().toISOString();
    run.payout_attempts = (run.payout_attempts || 0) + 1;
    const batch = {
      id: newId("bat"),
      run_id: run.id,
      bulletin_id: run.bulletin_id,
      storm: run.storm,
      sender_batch_id: `celerity-${run.id}`,
      attempt: run.payout_attempts,
      payout_batch_id: null,
      status: "SUBMITTING",
      approved_by: approver,
      created_at: now,
      submitted_at: now,
      updated_at: now,
      items: run.drafts.map((d) => ({
        family_id: d.family_id,
        sender_item_id: `${run.id}-${d.family_id}`,
        receiver: state.families.find((f) => f.id === d.family_id).paypal_email,
        amount: d.amount,
        currency: d.currency || POLICY.currency,
        status: "PENDING",
        payout_item_id: null,
        transaction_id: null,
        funding: allocations[d.family_id],
        history: [{ at: now, status: "APPROVED", source: approver }],
      })),
    };
    state.batches.push(batch);
    run.status = "submitting";
    run.batch_id = batch.id;
    const amount = batch.items.reduce((s, i) => s + i.amount, 0);
    log(
      "payout.submitting",
      approver,
      { recipients: batch.items.length, amount, currency: POLICY.currency, pools: poolTotals(allocations) },
      batch.id
    );
    return { batch: structuredClone(batch), run: structuredClone(run) };
  });

  const { batch, run } = claim;
  let res, error;
  try {
    res = await createPayoutBatch({
      senderBatchId: batch.sender_batch_id,
      requestId: `${batch.sender_batch_id}-${batch.attempt}`,
      emailSubject: "You received emergency cash aid from Celerity Relief",
      emailMessage: `Cash aid for families affected by ${run.storm}. No action is needed to keep it; it is already yours.`,
      items: batch.items.map((it) => ({
        receiver: it.receiver,
        amount: it.amount,
        currency: it.currency,
        note: `Celerity Relief: emergency cash aid for ${run.storm}. Stay safe.`,
        senderItemId: it.sender_item_id,
      })),
    });
  } catch (e) {
    error = e;
  }

  const outcome = await store.mutate((state, log) => {
    const b = state.batches.find((x) => x.id === batch.id);
    const r = state.runs.find((x) => x.id === runId);
    // Another instance resumed and finished this batch first.
    if (!b || b.status !== "SUBMITTING") return { batch: b };

    if (error && definiteRejection(error)) {
      state.batches.splice(state.batches.indexOf(b), 1);
      r.status = "awaiting_approval";
      r.batch_id = null;
      log("payout.error", "paypal", { message: error.message, name: error.paypalName || null, debugId: error.debugId || null }, r.id);
      return { error: new HttpError(502, `PayPal rejected the payout: ${error.message}`, { debugId: error.debugId }) };
    }
    if (error) {
      log("payout.unconfirmed", "paypal", { message: error.message, debugId: error.debugId || null }, b.id);
      return {
        error: new HttpError(502, "PayPal did not confirm the payout. Nothing will be paid twice: approve again to resume it.", {
          debugId: error.debugId,
        }),
      };
    }

    const now = new Date().toISOString();
    b.payout_batch_id = res.batch_header.payout_batch_id;
    b.status = res.batch_header.batch_status;
    b.updated_at = now;
    r.status = "approved";
    r.approved_by = approver;
    r.approved_at = now;
    log(
      "run.approved",
      approver,
      { recipients: b.items.length, amount: b.items.reduce((s, i) => s + i.amount, 0), currency: POLICY.currency },
      r.id
    );
    log(
      "payout.batch_created",
      "paypal",
      { payout_batch_id: b.payout_batch_id, sender_batch_id: b.sender_batch_id, batch_status: b.status },
      b.id
    );
    // Each family's private link goes out by SMS (simulated: the console
    // shows the text). Logged as a count only.
    log("farmer.notified", "system", { count: b.items.length, channel: "sms (simulated)" }, b.id);
    return { batch: b };
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

// Webhooks and polls arrive in any order, so a status only moves forward:
// a stale PENDING snapshot must not undo a SUCCESS. The one way out of a
// final state is money coming back after it was delivered.
const ITEM_RANK = { PENDING: 0, UNCLAIMED: 1, ONHOLD: 1 };
const BATCH_RANK = { SUBMITTING: 0, PENDING: 1, PROCESSING: 2 };
const FINAL_RANK = 9;
const CLAWBACK = new Set(["RETURNED", "REFUNDED", "REVERSED"]);

function moves(ranks, from, to) {
  const a = ranks[from] ?? FINAL_RANK;
  const b = ranks[to] ?? FINAL_RANK;
  if (a < FINAL_RANK) return b >= a;
  return from === "SUCCESS" && CLAWBACK.has(to);
}

function setItemStatus(log, batch, item, status, source, extra = {}) {
  if (extra.payout_item_id) item.payout_item_id = extra.payout_item_id;
  if (extra.transaction_id) item.transaction_id = extra.transaction_id;
  if (extra.error) item.error = extra.error;
  if (!status || item.status === status || !moves(ITEM_RANK, item.status, status)) return false;
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
  if (!status || batch.status === status || !moves(BATCH_RANK, batch.status, status)) return false;
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
  if (!before.payout_batch_id) throw new HttpError(409, "this batch is still being submitted: approve the run again to resume it");
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
  if (state.webhookIds.length > 5000) state.webhookIds.splice(0, state.webhookIds.length - 5000);

  const type = event.event_type || "";
  const r = event.resource || {};

  // A funder's checkout, in case their browser never came back to the app.
  if (type === "PAYMENT.CAPTURE.COMPLETED") {
    return completeContribution(state, log, {
      orderId: r.supplementary_data?.related_ids?.order_id,
      captureId: r.id,
      status: r.status,
      amount: r.amount?.value,
      currency: r.amount?.currency_code,
      source: "paypal-webhook",
    });
  }

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
