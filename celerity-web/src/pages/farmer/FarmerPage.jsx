import React, { useEffect, useState } from "react";
import Card from "../../design/Card";
import { api } from "../../lib/api";
import { money, stormName } from "../../lib/format";

/** The farmer's own page, opened from the private link in their SMS. Phone
 * first, Tagalog first. Shows only their own payouts that were sent. */

const STRINGS = {
  tl: {
    greeting: (n) => `Magandang araw, ${n}`,
    subtitle: "Ang tulong mo mula sa Celerity Relief",
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
    howTitle: "Paano kunin ang pera",
    how: (email) => [
      `Buksan ang PayPal at mag-log in gamit ang ${email}.`,
      "Ilipat sa GCash (sa GCash app: Cash In → PayPal) o i-withdraw sa bangko.",
      "Tapos na. Walang claim form na kailangang i-file.",
    ],
    unclaimed: (email) =>
      `Naghihintay ang pera mo sa PayPal. Gumawa ng PayPal account gamit ang ${email} para makuha ito. Hawak ito ng PayPal nang 30 araw.`,
    failed: "Hindi natuloy ang padalang ito. Babalik ang pera sa pondo, at tutulungan ka ng inyong MDRRMO.",
    earlier: "Mga naunang tulong",
    none: "Wala pang tulong na naipadala sa iyo. Makakatanggap ka ng text kapag mayroon na.",
    notFound: "Hindi namin mahanap ang link na ito. Siguraduhing buo ang link na binuksan mo mula sa text.",
    safe: "Ikaw lang ang may link na ito. Huwag itong ibahagi.",
    help: "May tanong? Tumawag sa inyong MDRRMO.",
    public: "Tingnan kung saan napunta ang lahat ng tulong",
    loading: "Kinukuha…",
    stormLabel: (bare) => `Bagyong ${bare}`,
    title: "Ang tulong mo · Celerity",
    statusLabel: { SUCCESS: "Natanggap", UNCLAIMED: "Hinihintay kang kunin", FAILED: "Hindi natuloy" },
  },
  en: {
    greeting: (n) => `Good day, ${n}`,
    subtitle: "Your aid from Celerity Relief",
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
    howTitle: "How to get the money",
    how: (email) => [
      `Open PayPal and log in with ${email}.`,
      "Move it to GCash (in the GCash app: Cash In → PayPal) or withdraw to your bank.",
      "That's it. No claim form to file.",
    ],
    unclaimed: (email) =>
      `Your money is waiting at PayPal. Create a PayPal account with ${email} to claim it. PayPal holds it for 30 days.`,
    failed: "This payment didn't go through. The money goes back to the fund, and your MDRRMO will help you.",
    earlier: "Earlier aid",
    none: "No aid has been sent to you yet. You'll get a text when there is.",
    notFound: "We can't find this link. Make sure you opened the whole link from your text message.",
    safe: "Only you have this link. Don't share it.",
    help: "Questions? Call your municipal disaster office (MDRRMO).",
    public: "See where all the relief went",
    loading: "Loading…",
    stormLabel: (bare) => `Typhoon ${bare}`,
    title: "Your aid · Celerity",
    statusLabel: { SUCCESS: "Received", UNCLAIMED: "Waiting for you to claim", FAILED: "Didn't go through" },
  },
};

const LANG_KEY = "celerity.farmerLang";
const FINAL = new Set(["SUCCESS", "FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED", "CANCELED"]);
const BAD = new Set(["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED", "CANCELED"]);

function readLang() {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "tl";
  } catch {
    return "tl";
  }
}

const bareStorm = (name) =>
  stormName(name).replace(/^\s*(super\s+)?(typhoon|tropical storm|severe tropical storm|tropical depression)\s+/i, "").trim();

const time = (iso, lang) =>
  iso ? new Date(iso).toLocaleTimeString(lang === "tl" ? "fil-PH" : "en-PH", { hour: "numeric", minute: "2-digit" }) : "";
const day = (iso, lang) =>
  iso ? new Date(iso).toLocaleDateString(lang === "tl" ? "fil-PH" : "en-PH", { month: "long", day: "numeric", year: "numeric" }) : "";

/** 0 approved, 1 sent to PayPal, 2 received. */
function stage(p) {
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

function Latest({ p, t, lang }) {
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

export default function FarmerPage({ token }) {
  const [lang, setLang] = useState(readLang);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const t = STRINGS[lang];

  useEffect(() => {
    document.title = t.title;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* private mode: the choice lasts this visit */
    }
  }, [lang, t.title]);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = () =>
      api
        .farmer(token)
        .then((d) => {
          if (cancelled) return;
          setData(d);
          setError(null);
          // Keep checking while money is still on its way.
          if (d.payouts.some((p) => !FINAL.has(p.status))) timer = setTimeout(tick, 10000);
        })
        .catch((e) => !cancelled && setError(e.status === 404 ? "notFound" : e.message));
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  const [latest, ...earlier] = data?.payouts || [];

  return (
    <div style={{ background: "var(--halo-soft), var(--paper-page)", minHeight: "100dvh" }}>
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 16, fontSize: 17 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <img src="/logo-lockup.png" alt="Celerity" style={{ height: 32, objectFit: "contain" }} />
          <div role="group" aria-label="Language" style={{ display: "flex", background: "var(--container)", borderRadius: 999, padding: 3 }}>
            {[
              ["tl", "Tagalog"],
              ["en", "English"],
            ].map(([code, label]) => (
              <button
                key={code}
                lang={code}
                aria-pressed={lang === code}
                onClick={() => setLang(code)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  minHeight: 40,
                  padding: "6px 14px",
                  font: "inherit",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: lang === code ? "var(--primary)" : "transparent",
                  color: lang === code ? "var(--on-primary)" : "var(--text-dim)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {error === "notFound" && (
          <Card>
            <p style={{ margin: 0, fontSize: 18 }}>{t.notFound}</p>
          </Card>
        )}
        {error && error !== "notFound" && <p style={{ color: "var(--bad-text)" }}>{error}</p>}
        {!data && !error && (
          <p style={{ color: "var(--text-faint)" }}>
            <span className="cel-spin" /> {t.loading}
          </p>
        )}

        {data && (
          <>
            <div lang={lang}>
              <h1 style={{ font: "var(--text-h1)", fontSize: 28, margin: 0 }}>{t.greeting(data.first_name)}</h1>
              <p style={{ margin: "4px 0 0", color: "var(--text-dim)" }}>
                {t.subtitle} · {data.municipality}, {data.province}
              </p>
            </div>

            {!latest && (
              <Card>
                <p style={{ margin: 0, fontSize: 18 }}>{t.none}</p>
              </Card>
            )}

            {latest && (
              <div lang={lang} className="cel-stack" style={{ gap: 16 }}>
                <Latest p={latest} t={t} lang={lang} />
                {!BAD.has(latest.status) && (
                  <Card>
                    <h2 style={{ font: "var(--text-h2)", margin: 0 }}>{t.howTitle}</h2>
                    <ol style={{ margin: "10px 0 0", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8, fontSize: 16 }}>
                      {t.how(latest.receiver).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </Card>
                )}
                {earlier.length > 0 && (
                  <Card>
                    <h2 style={{ font: "var(--text-h2)", margin: 0 }}>{t.earlier}</h2>
                    <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
                      {earlier.map((p) => (
                        <li key={p.sent_at + p.storm} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 16 }}>
                          <span style={{ minWidth: 0 }}>
                            <strong>{t.stormLabel(bareStorm(p.storm))}</strong>
                            <span style={{ display: "block", font: "var(--text-fine)", color: "var(--text-faint)" }}>
                              {day(p.sent_at, lang)} · {t.statusLabel[p.status] || (BAD.has(p.status) ? t.statusLabel.FAILED : t.steps[stage(p)])}
                            </span>
                          </span>
                          <strong style={{ whiteSpace: "nowrap" }}>{money(p.amount, p.currency)}</strong>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            )}
          </>
        )}

        <footer lang={lang} style={{ display: "flex", flexDirection: "column", gap: 6, font: "var(--text-meta)", color: "var(--text-faint)", marginTop: 4 }}>
          <span>🔒 {t.safe}</span>
          <span>{t.help}</span>
          <a href="#/public" style={{ color: "var(--primary)", fontWeight: 700 }}>
            {t.public}
          </a>
        </footer>
      </main>
    </div>
  );
}
