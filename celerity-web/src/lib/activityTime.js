// Activity timestamps + date grouping.
//
// On-chain relief receipts carry NO timestamp (the contract records only
// event/pool/funder/amount), so for the demo we synthesize a plausible date
// from each receipt's on-chain order: the most recent receipt reads as earlier
// today, and each older one steps back roughly a day. Cash-outs use their real
// `when`. These synthesized dates are demo-only and never presented as
// on-chain facts.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/**
 * Synthesize a timestamp for a receipt given its position counted from the
 * newest (0 = most recent). Newest lands a few hours ago (so it's "Today");
 * each older one steps back ~1 day, with a small offset so they don't all sit
 * at midnight.
 */
export function receiptWhen(indexFromNewest, nowMs) {
  return nowMs - (3 * HOUR + indexFromNewest * DAY + indexFromNewest * 37 * 60 * 1000);
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
