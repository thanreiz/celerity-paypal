import React from "react";
import Card from "../../design/Card";
import { money, stormName } from "../../lib/format";

/** Pieces of the Farmer app: strings (Tagalog first), payout status steps
 * and the latest-payout card. */

export const STRINGS = {
  tl: {
    latest: "Pinakabagong tulong",
    storm: (s) => `para sa ${s}`,
    steps: ["Naaprubahan", "Naipadala sa PayPal", "Natanggap mo"],
    sending: "Ipinapadala pa sa PayPal…",
    read: "Nabasa ang bulletin",
    received: "natanggap mo",
    sent: "naipadala",
    minutes: (n) => `${n} minuto`,
    before: "Dati: halos 5 buwan bago dumating ang tseke.",
    paidBy: "Galing kay",
    unclaimed: (email) =>
      `Naghihintay ang pera mo sa PayPal. Gumawa ng PayPal account gamit ang ${email} para makuha ito. Hawak ito ng PayPal nang 30 araw.`,
    failed: "Hindi natuloy ang padalang ito. Babalik ang pera sa pondo, at tutulungan ka ng inyong MDRRMO.",
    none: "Wala pang tulong na naipadala sa iyo. Makakatanggap ka ng text kapag mayroon na.",
    notFound: "Hindi namin mahanap ang link na ito. Siguraduhing buo ang link na binuksan mo mula sa text.",
    safe: "Ikaw lang ang may link na ito. Huwag itong ibahagi.",
    help: "May tanong? Tumawag sa inyong MDRRMO.",
    loading: "Kinukuha…",
    stormLabel: (bare) => `Bagyong ${bare}`,
    title: "Ang tulong mo · Celerity",
    statusLabel: { SUCCESS: "Natanggap", UNCLAIMED: "Hinihintay kang kunin", FAILED: "Hindi natuloy" },
  },
  en: {
    latest: "Latest aid",
    storm: (s) => `for ${s}`,
    steps: ["Approved", "Sent to PayPal", "You received it"],
    sending: "Still being sent to PayPal…",
    read: "Bulletin read",
    received: "you received it",
    sent: "sent",
    minutes: (n) => `${n} min`,
    before: "Before: a cheque took almost 5 months.",
    paidBy: "Paid by",
    unclaimed: (email) =>
      `Your money is waiting at PayPal. Create a PayPal account with ${email} to claim it. PayPal holds it for 30 days.`,
    failed: "This payment didn't go through. The money goes back to the fund, and your MDRRMO will help you.",
    none: "No aid has been sent to you yet. You'll get a text when there is.",
    notFound: "We can't find this link. Make sure you opened the whole link from your text message.",
    safe: "Only you have this link. Don't share it.",
    help: "Questions? Call your municipal disaster office (MDRRMO).",
    loading: "Loading…",
    stormLabel: (bare) => `Typhoon ${bare}`,
    title: "Your aid · Celerity",
    statusLabel: { SUCCESS: "Received", UNCLAIMED: "Waiting for you to claim", FAILED: "Didn't go through" },
  },
};

export const LANG_KEY = "celerity.farmerLang";
export const FINAL = new Set(["SUCCESS", "FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED", "CANCELED"]);
export const BAD = new Set(["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED", "CANCELED"]);

export function readLang() {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "tl";
  } catch {
    return "tl";
  }
}

export const bareStorm = (name) =>
  stormName(name).replace(/^\s*(super\s+)?(typhoon|tropical storm|severe tropical storm|tropical depression)\s+/i, "").trim();

export const time = (iso, lang) =>
  iso ? new Date(iso).toLocaleTimeString(lang === "tl" ? "fil-PH" : "en-PH", { hour: "numeric", minute: "2-digit" }) : "";
export const day = (iso, lang) =>
  iso ? new Date(iso).toLocaleDateString(lang === "tl" ? "fil-PH" : "en-PH", { month: "long", day: "numeric", year: "numeric" }) : "";

/** 0 approved, 1 sent to PayPal, 2 received. */
export function stage(p) {
  if (p.status === "SUCCESS") return 2;
  if (p.payout_batch_id && p.status !== "SUBMITTING") return 1;
  return 0;
}

function Steps({ p, t }) {
  const at = stage(p);
  return (
    <ol style={{ listStyle: "none", padding: 0, margin: "18px 0 0", display: "flex", gap: 6 }}>
      {t.steps.map((label, i) => {
        const done = i <= at;
        return (
          <li key={label} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{ height: 6, borderRadius: 999, background: done ? "var(--ok-text)" : "var(--container-high)" }}
            />
            <span style={{ font: "var(--text-fine)", fontWeight: done ? 700 : 500, color: done ? "var(--ok-text)" : "var(--text-faint)" }}>
              {done ? "✓\u00a0" : ""}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Latest({ p, t, lang }) {
  const storm = bareStorm(p.storm);
  const minutes = Math.max(1, Math.round((Date.parse(p.delivered_at || p.sent_at) - Date.parse(p.started_at)) / 60000));
  const bad = BAD.has(p.status);
  return (
    <Card>
      <span className="cel-section-label">{t.latest}</span>
      <p style={{ margin: "6px 0 0", fontSize: 44, fontWeight: 800, lineHeight: 1.1, color: bad ? "var(--bad-text)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {money(p.amount, p.currency)}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 18, color: "var(--text-dim)" }}>{t.storm(storm ? t.stormLabel(storm) : "—")}</p>

      {bad ? (
        <p role="status" style={{ margin: "16px 0 0", padding: "12px 14px", borderRadius: 12, background: "var(--bad-bg)", color: "var(--bad-text)", fontWeight: 600 }}>
          {t.failed}
        </p>
      ) : (
        <>
          <Steps p={p} t={t} />
          {p.status === "UNCLAIMED" && (
            <p role="status" style={{ margin: "14px 0 0", padding: "12px 14px", borderRadius: 12, background: "var(--warn-bg)", color: "var(--warn-text)", fontWeight: 600 }}>
              {t.unclaimed(p.receiver)}
            </p>
          )}
          {stage(p) === 0 && <p style={{ margin: "12px 0 0", color: "var(--text-faint)" }}>{t.sending}</p>}
        </>
      )}

      {!bad && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--container-highest)" }}>
          <p style={{ margin: 0, fontSize: 16 }}>
            {t.read} <strong>{time(p.started_at, lang)}</strong> → {p.delivered_at ? t.received : t.sent}{" "}
            <strong>{time(p.delivered_at || p.sent_at, lang)}</strong>{" "}
            <span style={{ color: "var(--ok-text)", fontWeight: 700 }}>({t.minutes(minutes)})</span>
          </p>
          <p style={{ margin: "4px 0 0", font: "var(--text-meta)", color: "var(--text-faint)" }}>{t.before}</p>
        </div>
      )}

      {p.funders.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <span className="cel-section-label">{t.paidBy}</span>
          <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
            {p.funders.map((f) => (
              <li key={f.name} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 16 }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{f.name}</strong>
                  {f.funder && <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-faint)" }}>{f.funder}</span>}
                </span>
                <strong style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money(f.amount, p.currency)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

