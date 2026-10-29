export function money(amount, currency = "USD") {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
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

export const FLAG_LABELS = { senior: "Senior", pwd: "PWD", infant: "Infant", pregnant: "Pregnant" };

export function flagList(vulnerability) {
  return Object.entries(FLAG_LABELS)
    .filter(([k]) => vulnerability?.[k])
    .map(([, label]) => label);
}

const EVENT_LABELS = {
  "run.started": "Agent run started",
  "run.drafted": "Agent drafted payouts",
  "run.failed": "Agent run failed",
  "run.approved": "Coordinator approved",
  "run.rejected": "Coordinator rejected",
  "run.draft_removed": "Draft removed",
  "payout.batch_created": "PayPal batch created",
  "payout.batch_status": "PayPal batch status",
  "payout.item_status": "Payout status",
  "payout.error": "PayPal error",
  "payout.submitting": "Sending to PayPal",
  "payout.resumed": "PayPal submission resumed",
  "payout.unconfirmed": "PayPal unconfirmed",
  "webhook.received": "PayPal webhook",
  "webhook.rejected": "Webhook rejected",
  "family.registered": "Family registered",
  "family.status": "Registration changed",
  "bulletin.received": "Bulletin received",
};

export const eventLabel = (type) => EVENT_LABELS[type] || type;

export function eventDetail(e) {
  const d = e.detail || {};
  switch (e.type) {
    case "run.drafted":
      return d.recipients ? `${d.storm}: ${d.recipients} families, ${money(d.amount, d.currency)}` : `${d.storm || "No storm"}: nothing to pay`;
    case "run.approved":
      return `${d.recipients} payouts, ${money(d.amount, d.currency)}`;
    case "payout.batch_created":
    case "payout.batch_status":
      return `${d.payout_batch_id} → ${d.batch_status}`;
    case "payout.item_status":
      return `${d.family_id ? `${d.family_id} → ` : ""}${d.status}${d.transaction_id ? ` (tx ${d.transaction_id})` : ""}`;
    case "webhook.received":
      return d.event_type;
    case "run.started":
      return d.bulletin;
    case "run.failed":
      return d.message || "The agent run failed";
    case "payout.error":
      return d.message || `PayPal refused the batch${d.name ? ` (${d.name})` : ""}`;
    case "payout.submitting":
      return `${d.recipients} payouts, ${money(d.amount, d.currency)} sent to PayPal`;
    case "payout.unconfirmed":
      return d.message || "PayPal did not confirm yet; approve again to resume";
    case "run.draft_removed":
      return d.recipients != null ? `${d.recipients} families left, ${money(d.amount, d.currency)}` : "";
    case "run.rejected":
      return d.reason || "";
    case "family.registered":
      return `${d.municipality}, ${d.province}`;
    case "family.status":
      return d.status;
    case "bulletin.received":
      return d.title;
    default:
      return "";
  }
}
