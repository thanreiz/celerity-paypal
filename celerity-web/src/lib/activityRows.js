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

const subtitleFor = (region, poolId) =>
  `${region != null ? `Region ${region} · ` : ""}Pool #${String(poolId)}`;

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
      subtitle: subtitleFor(region, r.pool_id),
      amountPhp: toPHPNumber(units),
      funder: r.funder,
      pool_id: r.pool_id,
      region,
      when: receiptWhen(receipts.length - 1 - i, now),
    };
  });

  // Reconcile claims against receipts, per pool: the first N claims (N = number
  // of on-chain receipts for that pool) are already represented by receiptRows,
  // so only the surplus — claims still in flight — become their own rows.
  const receiptCountByPool = new Map();
  for (const r of receipts) {
    const k = String(r.pool_id);
    receiptCountByPool.set(k, (receiptCountByPool.get(k) || 0) + 1);
  }
  const seenByPool = new Map(); // how many claims we've walked past for a pool
  const pendingClaimRows = [];
  // Oldest-first so the earliest claims are the ones considered "already
  // on-chain"; the most recent surplus claim is the one that stays pending.
  const claimsOldestFirst = [...claims].sort((a, b) => a.when - b.when);
  for (const c of claimsOldestFirst) {
    const k = String(c.poolId);
    const seen = seenByPool.get(k) || 0;
    seenByPool.set(k, seen + 1);
    const onChain = receiptCountByPool.get(k) || 0;
    if (seen < onChain) continue; // this claim is already shown as a receipt
    const pool = pools.find((p) => String(p.id) === String(c.poolId));
    const region = regionOf(c.poolId);
    pendingClaimRows.push({
      key: c.id,
      kind: "received",
      title: `Claimed · ${pool ? funderLabel(pool.funder) : "relief"}`,
      subtitle: subtitleFor(region, c.poolId),
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
