export function money(amount, currency = "USD") {
  const n = Number(amount) || 0;
  try {
    // Whole amounts without ".00": "₱4,500", but "₱4,500.50".
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function clock(iso) {
  return iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "";
}

export const short = (hash, n = 10) => (hash ? `${hash.slice(0, n)}…` : "");

/** "Typhoon DALISAY" -> "Typhoon Dalisay": bulletins shout storm names. */
export function stormName(name) {
  if (!name) return "";
  return String(name).replace(/\p{Lu}{2,}/gu, (w) => w[0] + w.slice(1).toLowerCase());
}

/** Rewrite "PHP 12,250" and "3250 PHP" in agent-written text as money
 * ("₱12,250"), so the trace and summary match the rest of the console. */
export function moneyText(text) {
  if (!text) return text;
  const fmt = (n, cur) => money(Number(n.replace(/,/g, "")), cur);
  return String(text)
    .replace(/\b(PHP|USD)\s?(\d[\d,]*(?:\.\d{1,2})?)/g, (_, cur, n) => fmt(n, cur))
    .replace(/\b(\d[\d,]*(?:\.\d{1,2})?)\s?(PHP|USD)\b/g, (_, n, cur) => fmt(n, cur));
}

export const FLAG_LABELS = { senior: "Senior", pwd: "PWD", infant: "Infant", pregnant: "Pregnant" };

export function flagList(vulnerability) {
  return Object.entries(FLAG_LABELS)
    .filter(([k]) => vulnerability?.[k])
    .map(([, label]) => label);
}

const EVENT_LABELS = {
  "run.started": "Run started",
  "run.drafted": "Payouts drafted",
  "case.opened": "Farmer case opened",
  "run.failed": "Agent run failed",
  "run.approved": "Payouts released",
  "run.rejected": "Coordinator rejected",
  "run.draft_removed": "Draft removed",
  "payout.batch_created": "PayPal batch created",
  "payout.batch_status": "PayPal batch status",
  "payout.item_status": "Payout status",
  "payout.error": "PayPal error",
  "payout.submitting": "Sending to PayPal",
  "pool.created": "Funding pool opened",
  "farmer.notified": "Farmers notified",
  "pool.funded": "Pool funded",
  "pool.funding_mismatch": "Funding amount mismatch",
  "pool.funding_reversed": "Funding taken back by PayPal",
  "pool.funding_reversal_unapplied": "Funding reversal needs a look",
  "payout.resumed": "PayPal submission resumed",
  "payout.unconfirmed": "PayPal unconfirmed",
  "webhook.received": "PayPal webhook",
  "webhook.rejected": "Webhook rejected",
  "family.registered": "Family registered",
  "family.status": "Registration changed",
  "bulletin.received": "Bulletin received",
};

export const eventLabel = (type) => EVENT_LABELS[type] || type;

/** One line describing an evidence entry. `names` (family id -> name) is
 * passed on the coordinator console only; the public view has no names. */
export function eventDetail(e, names = {}) {
  const d = e.detail || {};
  const who = (id) => (id && names[id]) || id;
  switch (e.type) {
    case "run.drafted": {
      const by = d.mode === "rules" ? "Rules, no AI · " : d.mode === "jev" ? "Rules + Jev · " : d.mode === "agent" ? "AI agent · " : "";
      return d.recipients
        ? `${by}${stormName(d.storm)}: ${d.recipients} families, ${money(d.amount, d.currency)}`
        : `${by}${stormName(d.storm) || "No storm"}: nothing to pay`;
    }
    case "run.approved":
      return `${e.actor === "rules" ? "By the rules" : e.actor === "jev" ? "By the rules + Jev" : "By a coordinator"}: ${d.recipients} payouts, ${money(d.amount, d.currency)}`;
    case "case.opened":
      return (d.topic || "").replace(/_/g, " ");
    case "payout.batch_created":
    case "payout.batch_status":
      return `${d.payout_batch_id} → ${d.batch_status}`;
    case "payout.item_status":
      return `${d.family_id ? `${who(d.family_id)} → ` : ""}${d.status}${d.transaction_id ? ` (tx ${d.transaction_id})` : ""}`;
    case "webhook.received":
      return d.event_type;
    case "run.started":
      return `${d.bulletin}${d.mode === "rules" ? " (rules)" : d.mode === "jev" ? " (rules + Jev)" : d.mode === "agent" ? " (AI agent)" : ""}`;
    case "run.failed":
      return d.message || "The agent run failed";
    case "payout.error":
      return d.message || `PayPal refused the batch${d.name ? ` (${d.name})` : ""}`;
    case "payout.submitting":
      return `${d.recipients} payouts, ${money(d.amount, d.currency)} sent to PayPal${d.pools?.length ? ` from ${d.pools.length} pool${d.pools.length === 1 ? "" : "s"}` : ""}`;
    case "farmer.notified":
      return `${d.count} famil${d.count === 1 ? "y" : "ies"} sent their private link${d.channel ? ` by ${d.channel}` : ""}`;
    case "pool.created":
      return `${d.name} (${d.funder})${d.provinces?.length ? `: ${d.provinces.join(", ")}` : ": nationwide"}${d.min_signal ? `, signal ${d.min_signal}+` : ""}`;
    case "pool.funded":
      return `${d.funder_name} → ${d.pool}, ${money(d.amount, d.currency)}`;
    case "pool.funding_reversed":
      return `${d.pool || "A pool"}: ${money(d.amount, d.currency)} ${d.partial ? "refunded in part" : "refunded or reversed"}`;
    case "payout.unconfirmed":
      return d.message || "PayPal did not confirm yet; approve again to resume";
    case "run.draft_removed":
      return d.recipients != null ? `${d.recipients} families left, ${money(d.amount, d.currency)}` : "";
    case "run.rejected":
      return d.reason || "";
    case "family.registered":
      return `${names[e.ref] ? `${names[e.ref]}, ` : ""}${d.municipality}, ${d.province}`;
    case "family.status":
      return names[e.ref] ? `${names[e.ref]}: ${d.status}` : d.status;
    case "bulletin.received":
      return d.title;
    default:
      return "";
  }
}
