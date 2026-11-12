// Turning approved drafts into PayPal Payouts, and keeping payout status in
// sync from webhooks (push) or batch lookups (pull). Every state change runs
// inside store.mutate, so it is applied whole or not at all; PayPal is always
// called outside it.

import { POLICY } from "./policy.js";
import { feeOf, PayPalError, createPayoutBatch, getPayoutBatch, paypalConfigured } from "./paypal.js";
import { newId } from "./store.js";
import { completeContribution, isReversalEvent, poolTotals, reverseContribution } from "./funding.js";
// The money rules at approval go through the core client, which can hand
// them to the Java core (CORE_MODE); off by default. Like PayPal, the core is
// called outside store.mutate.
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
// 408 (request timeout) says nothing about whether PayPal acted, so it is not one.
const definiteRejection = (e) => e instanceof PayPalError && e.status >= 400 && e.status < 500 && ![408, 409, 429].includes(e.status);

// PayPal answers a reused sender_batch_id with a 4xx, but the batch behind it
// exists and may be paid. I don't know the exact error name PayPal uses for
// this, so match any name or issue that says duplicate/already-exists for a
// batch id, and the message wording as well.
const DUPLICATE_BATCH_NAME = /DUPLICATE_BATCH|BATCH_ID_(ALREADY|DUPLICATE|EXISTS|IN_USE)|SENDER_BATCH_ID_(ALREADY|DUPLICATE|USED)|BATCH_ALREADY/i;
const DUPLICATE_BATCH_TEXT = /(sender_batch_id|batch id|batch_id)[^.]{0,60}(already|duplicate|exist|used|unique)|(already|duplicate)[^.]{0,60}(sender_batch_id|batch id|batch_id)|batch[^.]{0,30}already exists/i;
export function duplicateBatchError(e) {
  if (!(e instanceof PayPalError) || !(e.status >= 400 && e.status < 500)) return false;
  const issues = JSON.stringify(e.details || "");
  return DUPLICATE_BATCH_NAME.test(`${e.paypalName || ""} ${issues}`) || DUPLICATE_BATCH_TEXT.test(`${e.message || ""} ${issues}`);
}

// Approving needs PayPal. Without credentials, fail before anything is
// claimed, so the run stays awaiting approval and can still be rejected.
function requirePayPal() {
  if (!paypalConfigured()) {
    throw new HttpError(503, "PayPal is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
  }
}

async function askCore(store, runId) {
  if (!core.active()) return null;
  const state = await store.read();
  const run = state.runs.find((r) => r.id === runId);
  return run?.status === "awaiting_approval" && run.drafts.length ? core.prepareApproval(state, run) : null;
}

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
  const prepared = await askCore(store, runId);
  const claim = await store.mutate((state, log) => {
    const run = state.runs.find((r) => r.id === runId);
    if (!run) throw new HttpError(404, "run not found");

    if (run.status === "submitting") {
      requirePayPal();
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
    const { checks, allocation } = core.approvalAnswers(state, run, prepared);
    const violations = [];
    run.drafts.forEach((d, i) => {
      if (checks[i].length) violations.push({ family_id: d.family_id, errors: checks[i] });
    });
    if (violations.length) throw new HttpError(409, "drafts no longer pass policy", { violations });

    // Split every payout across the funders' pools that cover the family. A
    // pool another run drained since drafting stops the approval here.
    const { allocations, shortfalls } = allocation;
    if (shortfalls.length) {
      throw new HttpError(409, "drafts no longer pass policy", {
        violations: shortfalls.map((x) => ({
          family_id: x.family_id,
          errors: [`funding pools for ${x.province} are short by ${x.short} ${POLICY.currency}`],
        })),
      });
    }

    requirePayPal();
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

    // PayPal says this batch id was used: the batch exists and may be paid.
    // Keep it; a payout webhook for it will fill in its PayPal id.
    if (error && duplicateBatchError(error)) {
      log("payout.unconfirmed", "paypal", { message: error.message, name: error.paypalName || null, debugId: error.debugId || null }, b.id);
      return {
        error: new HttpError(
          502,
          "PayPal already has a batch for this run, so it was created. Do not approve again: its status arrives by webhook, or ask a developer to reconcile it.",
          { debugId: error.debugId }
        ),
      };
    }
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

// A batch that ends DENIED or CANCELED paid nobody. PayPal may not send an
// event for each item, and a PENDING item keeps its pool money committed and
// its family blocked, so the batch's still-pending items take its status; the
// "not paid" logic then frees them.
const FAILED_BATCH = new Set(["DENIED", "CANCELED"]);

function setBatchStatus(log, batch, status, source) {
  if (!status || batch.status === status || !moves(BATCH_RANK, batch.status, status)) return false;
  batch.status = status;
  batch.updated_at = new Date().toISOString();
  log("payout.batch_status", source, { payout_batch_id: batch.payout_batch_id, batch_status: status }, batch.id);
  if (FAILED_BATCH.has(status)) {
    for (const item of batch.items) if (item.status === "PENDING") setItemStatus(log, batch, item, status, source);
  }
  return true;
}

/** Apply a GET /v1/payments/payouts/{id} response to our batch record. */
export function applyBatchSnapshot(log, batch, snapshot, source = "paypal-poll") {
  // Items first, so a failed batch only fails the items PayPal gave no
  // status of their own.
  let changed = false;
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
  changed = setBatchStatus(log, batch, snapshot.batch_header?.batch_status, source) || changed;
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

// An event about a batch, item or order we have no record of is usually a
// stranger's (a smoke test, another app on the same PayPal account), but it
// can also beat our own write: PayPal may call before the batch's PayPal id
// is saved. Such an event is not marked seen, so PayPal's retry gets another
// try; once the event is older than this it is acknowledged and dropped.
export const WEBHOOK_RETRY_WINDOW_MS = 15 * 60_000;
const UNKNOWN = new Set(["unknown batch", "unknown item", "unknown order"]);

// Replay protection: event ids are remembered up to this many, far above what
// this app receives in the 3-day window PayPal retries (and the age check
// accepts), so the list never trims an id that could still be replayed.
export const WEBHOOK_IDS_KEPT = 20_000;

/**
 * Apply a verified PayPal webhook event to state. Returns what happened:
 * { duplicate }, { retry } (record not there yet: answer 5xx so PayPal
 * retries), or the outcome of applying it. The event id is recorded as seen
 * only when it was applied or deliberately ignored.
 */
export function applyWebhookEvent(state, log, event, now = Date.now()) {
  if (state.webhookIds.includes(event.id)) return { duplicate: true };

  const outcome = applyEvent(state, log, event);
  if (UNKNOWN.has(outcome.ignored)) {
    // Without a creation time the age can't be bounded, so don't ask for retries.
    const created = Date.parse(event.create_time || "");
    if (Number.isFinite(created) && now - created < WEBHOOK_RETRY_WINDOW_MS) return { retry: outcome.ignored };
  }

  state.webhookIds.push(event.id);
  if (state.webhookIds.length > WEBHOOK_IDS_KEPT) state.webhookIds.splice(0, state.webhookIds.length - WEBHOOK_IDS_KEPT);
  return outcome;
}

function applyEvent(state, log, event) {
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
      ...feeOf(r),
      source: "paypal-webhook",
    });
  }

  // Funding PayPal took back. A REFUNDED event's resource is the refund (its
  // own id and amount), a REVERSED or DENIED one is the capture itself; the
  // capture id is in related_ids or the refund's "up" link.
  if (isReversalEvent(type)) {
    const up = (r.links || []).find((l) => l.rel === "up")?.href?.match(/\/captures\/([^/?]+)/)?.[1];
    return reverseContribution(state, log, {
      type,
      orderId: r.supplementary_data?.related_ids?.order_id,
      captureIds: [r.supplementary_data?.related_ids?.capture_id, up, type === "PAYMENT.CAPTURE.REFUNDED" ? null : r.id],
      refundId: type === "PAYMENT.CAPTURE.REFUNDED" ? r.id : null,
      amount: r.amount?.value,
      currency: r.amount?.currency_code,
      source: "paypal-webhook",
    });
  }

  if (type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    let batch = state.batches.find((b) => b.payout_batch_id === r.batch_header?.payout_batch_id);
    if (!batch) batch = adoptBatch(state, log, r.batch_header);
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

// A batch event can name a batch whose PayPal id we never saved (PayPal made
// it but its answer was lost, or it said the sender_batch_id was taken). The
// header carries our sender_batch_id, so complete the SUBMITTING record.
function adoptBatch(state, log, header) {
  if (!header?.payout_batch_id || !header.sender_batch_id) return null;
  const batch = state.batches.find((b) => b.sender_batch_id === header.sender_batch_id && !b.payout_batch_id && b.status === "SUBMITTING");
  if (!batch) return null;
  const run = state.runs.find((x) => x.id === batch.run_id);
  const now = new Date().toISOString();
  batch.payout_batch_id = header.payout_batch_id;
  batch.updated_at = now;
  if (run && run.status === "submitting") {
    run.status = "approved";
    run.approved_by = batch.approved_by;
    run.approved_at = now;
  }
  log("payout.batch_created", "paypal-webhook", { payout_batch_id: batch.payout_batch_id, sender_batch_id: batch.sender_batch_id, batch_status: batch.status }, batch.id);
  return batch;
}
