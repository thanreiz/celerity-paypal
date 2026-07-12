// Builds the farmer's unified activity feed — used by both the Home recent
// list and the full Activity screen so they never disagree.
//
// Three sources feed in:
//   • receipts  — on-chain relief that landed (the source of truth for "+").
//   • claims    — installments claimed IN-APP this session, recorded the moment
//                 the tx succeeds so a row appears instantly (before the RPC's
//                 view of the ledger catches up).
//   • cashOuts  — demo "withdraw to pesos" movements ("−"), local-only.
//
// The subtlety this file exists to solve: a claimed installment would otherwise
// show TWICE — once as an instant "Claimed · …" (from claims) and again as
// "Received · …" once the poll fetches its on-chain receipt. So we reconcile:
// the on-chain receipt count per pool is authoritative, and a claim is only
// rendered while it's still PENDING (not yet reflected on-chain). As soon as the
// matching receipt appears, the claim row drops and the receipt row stands in
// its place — one payout, one row, no flicker.

import { UNIT } from "./config";
import { toPHPNumber } from "./anchor";
import { funderLabel } from "./celerity";
import { receiptWhen } from "./activityTime";
import { regionName } from "./regions";

// Plain-language subtitle: region only. No "Pool #" — that's contract
// vocabulary, not something a farmer should ever read on their own wallet.
const subtitleFor = (region) => (region != null ? regionName(region) : "");

function receiptCountsByPool(receipts) {
  const m = new Map();
  for (const r of receipts) {
    const k = String(r.pool_id);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/** A claim is still pending (not yet reflected by an on-chain receipt) when
 * the pool's current receipt count hasn't risen past what it was at claim
 * time. Shared by buildActivityRows and the balance calc so they can never
 * disagree about which claims are "in" vs already landed. */
export function pendingClaims(claims, receipts) {
  const counts = receiptCountsByPool(receipts);
  return claims.filter((c) => (counts.get(String(c.poolId)) || 0) <= (c.receiptCountAtClaim ?? 0));
}

/**
 * @returns rows sorted newest-first, each:
 *   { key, kind: "received"|"cashout", title, subtitle, amountPhp, when,
 *     funder?, pool_id?, region?, isDemo?, pending? }
 */
export function buildActivityRows({ receipts = [], claims = [], cashOuts = [], pools = [], now = Date.now() }) {
  const regionOf = (poolId) => pools.find((p) => String(p.id) === String(poolId))?.region;

  // Demo cash-outs — outgoing, real timestamps.
  const cashRows = cashOuts.map((c) => ({
    key: c.id,
    kind: "cashout",
    title: `Cashed out to ${c.destLabel}`,
    subtitle: "Cash-out",
    amountPhp: c.php,
    destLabel: c.destLabel,
    isDemo: true,
    when: c.when,
  }));

  // On-chain receipts — the truth for what arrived. No on-chain time, so dates
  // are synthesized by ledger order (newest = last), all within "today".
  const receiptRows = receipts.map((r, i) => {
    const units = Number(BigInt(r.amount)) / Number(UNIT);
    const region = regionOf(r.pool_id);
    return {
      key: `r-${i}`,
      kind: "received",
      title: `Received · ${funderLabel(r.funder)}`,
      subtitle: subtitleFor(region),
      amountPhp: toPHPNumber(units),
      funder: r.funder,
      pool_id: r.pool_id,
      region,
      when: receiptWhen(receipts.length - 1 - i, now),
    };
  });

  // Reconcile claims against receipts, per pool. A claim is "pending" (shows
  // its own instant row) until the pool's on-chain receipt count rises above
  // what it was WHEN THE CLAIM WAS MADE (claim.receiptCountAtClaim, captured
  // by FarmerApp.claim() at claim time — a stable fact, unlike the receipts'
  // synthesized display timestamps, which are recomputed relative to "now" on
  // every render and can't be compared against a real clock).
  //
  // This also fixes the "first claim of a pool" case: settle_event auto-pays
  // installment #1 as its own on-chain receipt before the farmer ever taps
  // Claim, so that receipt is already counted in receiptCountAtClaim for
  // every subsequent manual claim — it can never be mistaken for one.
  const pendingClaimRows = [];
  for (const c of pendingClaims(claims, receipts)) {
    const pool = pools.find((p) => String(p.id) === String(c.poolId));
    const region = regionOf(c.poolId);
    pendingClaimRows.push({
      key: c.id,
      kind: "received",
      title: `Claimed · ${pool ? funderLabel(pool.funder) : "relief"}`,
      subtitle: subtitleFor(region),
      amountPhp: c.php,
      funder: pool?.funder,
      pool_id: c.poolId,
      region,
      when: c.when,
      pending: true, // on-chain receipt hasn't been read back yet
    });
  }

  return [...cashRows, ...receiptRows, ...pendingClaimRows].sort((a, b) => b.when - a.when);
}
