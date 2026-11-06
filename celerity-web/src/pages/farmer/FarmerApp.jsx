import React, { useEffect, useRef, useState } from "react";
import Card from "../../design/Card";
import Button from "../../design/Button";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import { BAD, FINAL, LANG_KEY, Latest, STRINGS, bareStorm, day, readLang, stage } from "./parts";
import "../apps.css";

/** The Farmer app, as in the original Celerity: a phone app with a balance
 * hero, receipts and help. Opened from the private link in the farmer's SMS
 * (#/r/<token>); the demo's "Is this you?" screen (#/farmer) picks one. */

const APP = {
  tl: {
    hi: (n) => `Kumusta, ${n}`,
    received: "Natanggap mo na",
    onTheWay: (m) => `${m} pa ang papunta`,
    viaPaypal: "sa PayPal mo",
    cashOut: "Ilipat sa GCash",
    history: "Kasaysayan",
    stormTitle: "Bagyo sa lugar mo",
    signal: (n, town) => `Signal No. ${n} sa ${town}`,
    qualifies: "Kwalipikado ka. Ipapadala ang tulong nang awtomatiko.",
    paidAlready: "Naipadala na ang tulong mo para sa bagyong ito.",
    notQualified: "Hindi pasok sa tulong ngayon:",
    noStorm: "Walang wind signal sa lugar mo ngayon. Ligtas ka.",
    fundedBy: "Pondo mula sa",
    quick: ["Ilipat sa GCash", "Magtanong", "Aking lugar", "Saan napunta"],
    recent: "Mga natanggap",
    seeAll: "Lahat",
    tabs: ["Home", "Kasaysayan", "Tulong", "Ako"],
    helpTitle: "Magtanong kay Celerity",
    helpSub: "Sasagot ito tungkol sa sarili mong tulong lang. Hindi ito nakapagpapadala ng pera.",
    helpHello: (n) => `Kumusta, ${n}! Ano ang maitutulong ko? Puwede kang magtanong kung nasaan ang pera mo, paano ito ilipat sa GCash, o mag-report ng sira sa bukid.`,
    asks: ["Nasaan na ang pera ko?", "Paano ilipat sa GCash?", "Nalubog ang palay ko sa baha"],
    placeholder: "I-type ang tanong mo…",
    send: "Ipadala",
    thinking: "Sumasagot…",
    caseOpened: "May coordinator na titingin dito.",
    cashTitle: "Ilipat ang pera sa GCash o bangko",
    cashSteps: [
      "Buksan ang PayPal app at mag-log in gamit ang email mo sa ibaba.",
      "Sa Wallet, i-link ang GCash (o bangko mo).",
      "Pindutin ang Transfer money, ilagay ang halaga, at kumpirmahin.",
      "Wala ka pang PayPal? Mag-sign up gamit ang email na iyon. Hawak ng PayPal ang pera nang 30 araw.",
    ],
    yourEmail: "Email sa PayPal",
    openPaypal: "Buksan ang PayPal",
    profile: "Ang record mo",
    town: "Bayan",
    status: "Status",
    household: "Miyembro ng pamilya",
    since: "Rehistrado mula",
    active: "Aktibo",
    language: "Wika",
    switch: "Hindi ikaw ito? Pumili ng iba",
    cases: "Mga report mo",
    connectTitle: "Ikaw ba ito?",
    connectSub: "Demo: pumili ng magsasaka. Sa totoo, binubuksan ito mula sa link sa text mo.",
    tagline: "Relief that moves.",
    none: "Wala pa",
  },
  en: {
    hi: (n) => `Hello, ${n}`,
    received: "You've received",
    onTheWay: (m) => `${m} more on the way`,
    viaPaypal: "in your PayPal",
    cashOut: "Move to GCash",
    history: "History",
    stormTitle: "Storm in your area",
    signal: (n, town) => `Signal No. ${n} in ${town}`,
    qualifies: "You qualify. Aid is sent automatically.",
    paidAlready: "Your aid for this storm has been sent.",
    notQualified: "Not eligible right now:",
    noStorm: "No wind signal over your town right now. You're safe.",
    fundedBy: "Funded by",
    quick: ["Move to GCash", "Ask", "My area", "Where it went"],
    recent: "Received",
    seeAll: "All",
    tabs: ["Home", "History", "Help", "Me"],
    helpTitle: "Ask Celerity",
    helpSub: "It answers about your own aid only. It can't send money.",
    helpHello: (n) => `Hi ${n}! How can I help? Ask where your money is, how to move it to GCash, or report damage to your farm.`,
    asks: ["Where is my money?", "How do I move it to GCash?", "My rice field flooded"],
    placeholder: "Type your question…",
    send: "Send",
    thinking: "Answering…",
    caseOpened: "A coordinator will follow up on this.",
    cashTitle: "Move the money to GCash or a bank",
    cashSteps: [
      "Open the PayPal app and log in with the email below.",
      "Under Wallet, link GCash (or your bank).",
      "Tap Transfer money, enter the amount, and confirm.",
      "No PayPal yet? Sign up with that email. PayPal holds the money for 30 days.",
    ],
    yourEmail: "PayPal email",
    openPaypal: "Open PayPal",
    profile: "Your record",
    town: "Town",
    status: "Status",
    household: "Household members",
    since: "Registered since",
    active: "Active",
    language: "Language",
    switch: "Not you? Pick someone else",
    cases: "Your reports",
    connectTitle: "Is this you?",
    connectSub: "Demo: pick a farmer. For real, this opens from the link in your text message.",
    tagline: "Relief that moves.",
    none: "None yet",
  },
};

const Icon = ({ d, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const I = {
  home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3h.01",
  me: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  cash: "M12 19V5m0 14-6-6m6 6 6-6",
  pin: "M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-8.4-12h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18",
  down: "M12 5v14m0 0 6-6m-6 6-6-6",
  wind: "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8",
};

function LangToggle({ lang, setLang }) {
  return (
    <div role="group" aria-label="Language" style={{ display: "flex", background: "var(--container)", borderRadius: 999, padding: 3 }}>
      {[
        ["tl", "TL"],
        ["en", "EN"],
      ].map(([code, label]) => (
        <button
          key={code}
          lang={code}
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          style={{
            border: "none",
            borderRadius: 999,
            minHeight: 36,
            minWidth: 44,
            font: "inherit",
            fontSize: 13,
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
  );
}

function useLang() {
  const [lang, setLang] = useState(readLang);
  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* private mode */
    }
  }, [lang]);
  return [lang, setLang];
}

/** #/farmer: the original "Is this you?" screen, over the seeded demo farmers. */
export function FarmerConnect() {
  const [lang, setLang] = useLang();
  const a = APP[lang];
  const [farmers, setFarmers] = useState(null);
  useEffect(() => {
    document.title = "Farmer app · Celerity";
    api.demoFarmers().then((d) => setFarmers(d.farmers)).catch(() => setFarmers([]));
  }, []);
  return (
    <div className="app-shell">
      <div className="phone">
        <div className="phone-body" style={{ paddingBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <img src="/logo-dove.png" alt="Celerity" style={{ height: 30 }} />
            <LangToggle lang={lang} setLang={setLang} />
          </div>
          <div style={{ textAlign: "center", padding: "18px 0 6px" }}>
            <img src="/logo-lockup.png" alt="" style={{ height: 44, objectFit: "contain" }} />
            <p style={{ margin: "8px 0 0", font: "var(--text-body-lg)", color: "var(--primary)" }}>{a.tagline}</p>
          </div>
          <div lang={lang}>
            <h1 style={{ font: "var(--text-h1)", margin: 0 }}>{a.connectTitle}</h1>
            <p style={{ margin: "4px 0 0", color: "var(--text-dim)", font: "var(--text-meta)" }}>{a.connectSub}</p>
          </div>
          <div className="app-card" style={{ padding: 6 }}>
            {!farmers && <p style={{ padding: 12 }}><span className="cel-spin" /></p>}
            {farmers?.map((f) => (
              <a
                key={f.token}
                href={`#/r/${f.token}`}
                className="cel-press"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, textDecoration: "none", color: "var(--text)" }}
              >
                <span className="app-avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                  {f.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "block" }}>{f.name}</strong>
                  <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>
                    {f.municipality}, {f.province}
                  </span>
                </span>
                <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
              </a>
            ))}
            {farmers && !farmers.length && <p style={{ padding: 12, color: "var(--text-faint)" }}>{a.none}</p>}
          </div>
          <a href="#/" style={{ color: "var(--primary)", font: "var(--text-fine)", textAlign: "center" }}>
            Celerity
          </a>
        </div>
      </div>
    </div>
  );
}

function StormCard({ status, a }) {
  const s = status?.storms?.[0];
  if (!s) {
    return (
      <div className="app-card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--ok-bg)", color: "var(--ok-text)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon d={I.wind} size={20} />
        </span>
        <span style={{ font: "var(--text-meta)", color: "var(--text-dim)" }}>{a.noStorm}</span>
      </div>
    );
  }
  const paid = s.reasons.some((r) => /already paid/.test(r));
  return (
    <div className="app-card" style={{ borderColor: s.qualifies_now || paid ? "var(--ok-line)" : "var(--warn-line)" }}>
      <div style={{ font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)" }}>{a.stormTitle}</div>
      <div style={{ font: "var(--text-body-lg)", fontWeight: 700, marginTop: 4 }}>
        {s.storm} · {a.signal(s.my_signal, status.town)}
      </div>
      <p style={{ margin: "6px 0 0", font: "var(--text-meta)", color: paid || s.qualifies_now ? "var(--ok-text)" : "var(--warn-text)", fontWeight: 600 }}>
        {paid ? a.paidAlready : s.qualifies_now ? a.qualifies : `${a.notQualified} ${s.reasons.join("; ")}`}
      </p>
      {s.funded_by.length > 0 && (
        <p style={{ margin: "6px 0 0", font: "var(--text-fine)", color: "var(--text-faint)" }}>
          {a.fundedBy}: {s.funded_by.join(", ")}
        </p>
      )}
    </div>
  );
}

function PayoutRows({ payouts, t, lang }) {
  return (
    <ul className="app-list">
      {payouts.map((p) => {
        const bad = BAD.has(p.status);
        return (
          <li key={p.sent_at + p.storm}>
            <span className="ico" aria-hidden="true" style={bad ? { background: "var(--bad-bg)", color: "var(--bad-text)" } : undefined}>
              <Icon d={I.down} size={18} />
            </span>
            <span className="main">
              <span className="title">
                {t.stormLabel(bareStorm(p.storm))}
              </span>
              <span className="meta" style={{ display: "block" }}>
                {day(p.sent_at, lang)} · {t.statusLabel[p.status] || (bad ? t.statusLabel.FAILED : t.steps[stage(p)])}
                {p.funders.length ? ` · ${p.funders.map((f) => f.funder || f.name).join(", ")}` : ""}
              </span>
            </span>
            <span className="amt" style={{ color: bad ? "var(--bad-text)" : "var(--ok-text)" }}>
              +{money(p.amount, p.currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CashOut({ data, a, onClose }) {
  return (
    <div className="app-modal-back" role="dialog" aria-modal="true" aria-label={a.cashTitle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="app-modal cel-pop" style={{ maxWidth: 440 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <h2 style={{ margin: 0, font: "var(--text-h2)" }}>{a.cashTitle}</h2>
          <button className="app-pill" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ol style={{ margin: "14px 0 0", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10, font: "var(--text-body)" }}>
          {a.cashSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="app-card" style={{ marginTop: 14, background: "var(--surface-low)", display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span style={{ color: "var(--text-faint)", font: "var(--text-meta)" }}>{a.yourEmail}</span>
          <strong>{data.registration?.paypal_email}</strong>
        </div>
        <Button variant="primary" style={{ marginTop: 16, width: "100%", background: "#003087" }} onClick={() => window.open("https://www.sandbox.paypal.com/myaccount/summary", "_blank", "noopener")}>
          {a.openPaypal}
        </Button>
      </div>
    </div>
  );
}

function Help({ token, data, a, lang }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const end = useRef(null);
  // Braces matter: scrollIntoView can return a Promise, and an effect may
  // only return a cleanup function.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (text) => {
    const body = text.trim();
    if (!body || busy) return;
    const next = [...messages, { role: "farmer", text: body }].slice(-12);
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const out = await api.help(token, next);
      setMessages((m) => [...m, { role: "helper", text: out.reply, case: out.case }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div lang={lang} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h1 style={{ font: "var(--text-h1)", margin: 0 }}>{a.helpTitle}</h1>
        <p style={{ margin: "4px 0 0", font: "var(--text-meta)", color: "var(--text-faint)" }}>{a.helpSub}</p>
      </div>
      <div className="chat" aria-live="polite">
        <div className="bubble helper">{a.helpHello(data.first_name)}</div>
        {messages.map((m, i) => (
          <React.Fragment key={i}>
            <div className={`bubble ${m.role}`}>{m.text}</div>
            {m.case && <span className="app-tag rules" style={{ alignSelf: "flex-start" }}>✓ {a.caseOpened}</span>}
          </React.Fragment>
        ))}
        {busy && (
          <div className="bubble helper" style={{ color: "var(--text-faint)" }}>
            <span className="cel-spin" /> {a.thinking}
          </div>
        )}
        {error && <div role="alert" style={{ color: "var(--bad-text)", font: "var(--text-meta)" }}>{error}</div>}
        <div ref={end} />
      </div>
      {messages.length === 0 && (
        <div className="app-chips">
          {a.asks.map((q) => (
            <button key={q} className="app-chip" onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input className="app-input" value={draft} maxLength={600} onChange={(e) => setDraft(e.target.value)} placeholder={a.placeholder} aria-label={a.placeholder} />
        <Button type="submit" variant="primary" disabled={busy || !draft.trim()}>
          {a.send}
        </Button>
      </form>
    </div>
  );
}

export default function FarmerApp({ token }) {
  const [lang, setLang] = useLang();
  const t = STRINGS[lang];
  const a = APP[lang];
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cashOut, setCashOut] = useState(false);

  useEffect(() => {
    document.title = t.title;
  }, [t.title]);

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
          // Keep checking while money is on its way, slower otherwise.
          timer = setTimeout(tick, d.payouts.some((p) => !FINAL.has(p.status)) ? 8000 : 20000);
        })
        .catch((e) => !cancelled && setError(e.status === 404 ? "notFound" : e.message));
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  const payouts = data?.payouts || [];
  const cur = data?.currency || "PHP";
  const got = payouts.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0);
  const coming = payouts.filter((p) => !FINAL.has(p.status) && !BAD.has(p.status)).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="app-shell">
      <div className="phone">
        <div className="phone-body" lang={lang}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <img src="/logo-dove.png" alt="Celerity" style={{ height: 30 }} />
            <LangToggle lang={lang} setLang={setLang} />
          </header>

          {error === "notFound" && (
            <Card>
              <p style={{ margin: 0, fontSize: 18 }}>{t.notFound}</p>
              <a href="#/farmer" style={{ color: "var(--primary)", fontWeight: 700 }}>{a.switch}</a>
            </Card>
          )}
          {error && error !== "notFound" && <p style={{ color: "var(--bad-text)" }}>{error}</p>}
          {!data && !error && (
            <p style={{ color: "var(--text-faint)" }}>
              <span className="cel-spin" /> {t.loading}
            </p>
          )}

          {data && tab === 0 && (
            <div key="home" className="cel-swap" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h1 style={{ font: "var(--text-body-lg)", fontWeight: 500, margin: 0 }}>
                {a.hi("")}
                <strong>{data.first_name}</strong>
              </h1>
              <section className="app-hero">
                <div className="label">
                  {a.received} · {a.viaPaypal}
                </div>
                <div className="big">{money(got, cur)}</div>
                <div className="sub">{coming > 0 ? a.onTheWay(money(coming, cur)) : `${data.municipality}, ${data.province}`}</div>
                <div className="app-hero-actions">
                  <button className="app-hero-btn" onClick={() => setCashOut(true)}>
                    <Icon d={I.cash} size={18} /> {a.cashOut}
                  </button>
                  <button className="app-hero-btn" onClick={() => setTab(1)}>
                    {a.history}
                  </button>
                </div>
              </section>

              <StormCard status={data.storm_status} a={a} />

              {payouts[0] && <Latest p={payouts[0]} t={t} lang={lang} />}

              <nav className="app-card app-quick">
                <button onClick={() => setCashOut(true)}>
                  <span className="ico"><Icon d={I.cash} /></span>
                  {a.quick[0]}
                </button>
                <button onClick={() => setTab(2)}>
                  <span className="ico"><Icon d={I.help} /></span>
                  {a.quick[1]}
                </button>
                <button onClick={() => setTab(3)}>
                  <span className="ico"><Icon d={I.pin} /></span>
                  {a.quick[2]}
                </button>
                <a href="#/public">
                  <span className="ico"><Icon d={I.globe} /></span>
                  {a.quick[3]}
                </a>
              </nav>

              {!payouts.length && (
                <Card>
                  <p style={{ margin: 0 }}>{t.none}</p>
                </Card>
              )}
              <p style={{ margin: 0, font: "var(--text-fine)", color: "var(--text-faint)" }}>🔒 {t.safe}</p>
            </div>
          )}

          {data && tab === 1 && (
            <div key="history" className="cel-swap" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h1 style={{ font: "var(--text-h1)", margin: 0 }}>{a.history}</h1>
              <div className="app-card">{payouts.length ? <PayoutRows payouts={payouts} t={t} lang={lang} /> : <p style={{ margin: 0 }}>{t.none}</p>}</div>
            </div>
          )}

          {data && tab === 2 && <Help token={token} data={data} a={a} lang={lang} />}

          {data && tab === 3 && (
            <div key="me" className="cel-swap" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h1 style={{ font: "var(--text-h1)", margin: 0 }}>{a.profile}</h1>
              <div className="app-card">
                <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 16px" }}>
                  <dt style={{ color: "var(--text-faint)" }}>{a.town}</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>
                    {data.municipality}, {data.province}
                  </dd>
                  <dt style={{ color: "var(--text-faint)" }}>{a.status}</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>{data.registration?.status === "active" ? a.active : data.registration?.status}</dd>
                  <dt style={{ color: "var(--text-faint)" }}>{a.household}</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>{data.registration?.household_size}</dd>
                  <dt style={{ color: "var(--text-faint)" }}>{a.yourEmail}</dt>
                  <dd style={{ margin: 0, fontWeight: 700, overflowWrap: "anywhere" }}>{data.registration?.paypal_email}</dd>
                  <dt style={{ color: "var(--text-faint)" }}>{a.since}</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>{day(data.registration?.registered_at, lang)}</dd>
                </dl>
              </div>
              <StormCard status={data.storm_status} a={a} />
              {data.cases?.length > 0 && (
                <div className="app-card">
                  <strong>{a.cases}</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, font: "var(--text-meta)" }}>
                    {data.cases.map((c) => (
                      <li key={c.at}>
                        {c.topic.replace(/_/g, " ")} · {day(c.at, lang)} · {c.status}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p style={{ margin: 0, font: "var(--text-meta)", color: "var(--text-faint)" }}>{t.help}</p>
              <a href="#/farmer" style={{ color: "var(--primary)", fontWeight: 700 }}>{a.switch}</a>
            </div>
          )}
        </div>

        {data && (
          <nav className="phone-tabs" aria-label="Farmer app">
            {[I.home, I.pulse, I.help, I.me].map((d, i) => (
              <button key={d} aria-current={tab === i ? "page" : undefined} onClick={() => setTab(i)}>
                <Icon d={d} size={20} />
                {a.tabs[i]}
              </button>
            ))}
          </nav>
        )}
      </div>
      {cashOut && data && <CashOut data={data} a={a} onClose={() => setCashOut(false)} />}
    </div>
  );
}
