// The farmer's side: a private link per family, the SMS that would carry it,
// and what the farmer sees when they open it. SMS sending is simulated: the
// console shows the exact text; nothing is texted.

import { randomBytes } from "node:crypto";
import { POLICY } from "./policy.js";

/** Unguessable per-family link token (144 bits). */
export const newLinkToken = () => randomBytes(18).toString("base64url");

/** "juan.dela.cruz@example.com" -> "ju••••••••••••@example.com". */
export function maskEmail(email) {
  const [user, domain] = String(email || "").split("@");
  if (!domain) return "";
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

/** "Typhoon DALISAY" -> "Bagyong Dalisay" (tl) / "Typhoon Dalisay" (en). */
export function stormLabel(name, lang = "tl") {
  const bare = String(name || "")
    .replace(/^\s*(super\s+)?(typhoon|tropical storm|severe tropical storm|tropical depression)\s+/i, "")
    .replace(/\p{Lu}{2,}/gu, (w) => w[0] + w.slice(1).toLowerCase())
    .trim();
  if (!bare) return lang === "tl" ? "ang bagyo" : "the storm";
  return lang === "tl" ? `Bagyong ${bare}` : `Typhoon ${bare}`;
}

export function peso(amount, currency = POLICY.currency) {
  const n = Number(amount) || 0;
  const whole = Number.isInteger(n);
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2 }).format(n);
}

export const farmerLink = (base, token) => `${base}/#/r/${token}`;

/** The SMS a farmer gets when their payout is sent, in Tagalog and English. */
export function smsText(family, item, run, link) {
  const name = firstName(family?.name);
  const amount = peso(item.amount, item.currency);
  return {
    tl: `Celerity Relief: ${name}, ang ${amount} na tulong para sa ${stormLabel(run?.storm, "tl")} ay naipadala na sa PayPal mo. Tingnan: ${link}`,
    en: `Celerity Relief: ${name}, your ${amount} aid for ${stormLabel(run?.storm, "en")} was sent to your PayPal. See: ${link}`,
    link,
  };
}

/** What a farmer sees through their link: only their own payouts that were
 * actually sent, newest first. No other family, no raw email, no
 * vulnerability details. */
export function farmerView(state, family) {
  const runs = Object.fromEntries(state.runs.map((r) => [r.id, r]));
  const poolNames = Object.fromEntries((state.pools || []).map((p) => [p.id, p]));
  const payouts = [];
  for (const b of state.batches) {
    for (const it of b.items) {
      if (it.family_id !== family.id) continue;
      const delivered = it.history.find((h) => h.status === "SUCCESS");
      payouts.push({
        storm: b.storm,
        amount: it.amount,
        currency: it.currency,
        status: b.status === "SUBMITTING" ? "SUBMITTING" : it.status,
        history: it.history.map((h) => ({ status: h.status, at: h.at })),
        funders: (it.funding || []).map((f) => ({
          name: poolNames[f.pool_id]?.name || "Funding pool",
          funder: poolNames[f.pool_id]?.funder || "",
          amount: f.amount,
        })),
        payout_batch_id: b.payout_batch_id,
        receiver: maskEmail(it.receiver),
        started_at: runs[b.run_id]?.started_at || b.created_at,
        sent_at: b.created_at,
        delivered_at: delivered?.at || null,
      });
    }
  }
  payouts.sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
  return {
    first_name: firstName(family.name),
    municipality: family.municipality,
    province: family.province,
    currency: POLICY.currency,
    payouts,
  };
}
