// Activity timestamps + date grouping.
//
// On-chain relief receipts carry NO timestamp (the contract records only
// event/pool/funder/amount), so for the demo we synthesize a plausible time
// from each receipt's on-chain order. The demo is a single live event, so every
// pre-seeded receipt reads as TODAY — the newest a few minutes ago and each
// older one a bit earlier — instead of marching a day into the past per row
// (which made a payout that just happened read as "Yesterday" / "Thursday").
// Cash-outs and in-app claims use their real `when`. These synthesized times are
// demo-only and never presented as on-chain facts.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Spacing between consecutive receipts, counting back from the newest. Small
// enough that a realistic run of receipts all stays within today.
const RECEIPT_STEP = 23 * MIN;
const RECEIPT_HEAD = 4 * MIN; // how long ago the newest receipt reads

/**
 * Synthesize a timestamp for a receipt given its position counted from the
 * newest (0 = most recent). The newest lands ~4 min ago; each older one steps
 * back ~23 min, so the whole set reads as "Today" for the live demo. Clamped so
 * it never crosses midnight into "Yesterday" — a long history compresses toward
 * the start of today rather than spilling to prior days.
 */
export function receiptWhen(indexFromNewest, nowMs) {
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const proposed = nowMs - (RECEIPT_HEAD + indexFromNewest * RECEIPT_STEP);
  // Keep it inside today (leave a 1-min cushion after midnight).
  return Math.max(startOfToday.getTime() + MIN, proposed);
}

/** Which section a timestamp falls into, relative to `nowMs`. */
export function bucketOf(whenMs, nowMs) {
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  if (whenMs >= todayMs) return "Today";
  if (whenMs >= todayMs - DAY) return "Yesterday";
  if (whenMs >= todayMs - 7 * DAY) return "This week";
  return "Earlier";
}

export const BUCKET_ORDER = ["Today", "Yesterday", "This week", "Earlier"];

/**
 * Short, human date for a single row. Today/Yesterday read as words; recent
 * days show the weekday; older shows "Mon D" (+ year if not this year).
 */
export function formatDate(whenMs, nowMs) {
  const bucket = bucketOf(whenMs, nowMs);
  const d = new Date(whenMs);
  if (bucket === "Today") return `Today, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  if (bucket === "Yesterday") return "Yesterday";
  if (bucket === "This week") return d.toLocaleDateString(undefined, { weekday: "long" });
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Group already-sorted (newest-first) rows into [{ bucket, rows }] in
 * BUCKET_ORDER, skipping empty buckets. Each row must have a numeric `when`.
 */
export function groupByBucket(rows, nowMs) {
  const byBucket = new Map();
  for (const row of rows) {
    const b = bucketOf(row.when, nowMs);
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b).push(row);
  }
  return BUCKET_ORDER.filter((b) => byBucket.has(b)).map((b) => ({ bucket: b, rows: byBucket.get(b) }));
}
