import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../design/Button";
import Toast from "../../design/Toast";
import { api } from "../../lib/api";
import { money, stormName, when } from "../../lib/format";
import { NewPoolModal, TopUpModal } from "./PoolModals";
import "../apps.css";

/** The Funder app: a funder signs in as their institution, sees only their
 * own pools, cashes in through PayPal Checkout, and follows every release
 * to the towns it reached. Celerity (rules + agents) decides the payouts. */

const WHO_KEY = "celerity.funder";
const readWho = () => {
  try {
    return localStorage.getItem(WHO_KEY) || "";
  } catch {
    return "";
  }
};
const saveWho = (id) => {
  try {
    if (id) localStorage.setItem(WHO_KEY, id);
    else localStorage.removeItem(WHO_KEY);
  } catch {
    /* private mode */
  }
};

const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const I = {
  pools: "M3 21h18M5 21V10m14 11V10M12 3 3 8h18l-9-5ZM9 21v-6h6v6",
  ledger: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 16h2",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-8.4-12h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18",
  plus: "M12 5v14M5 12h14",
  up: "M12 19V5m0 0-6 6m6-6 6 6",
  back: "M19 12H5m0 0 7 7m-7-7 7-7",
  down: "M12 5v14m0 0 6-6m-6 6-6-6",
};

function DecidedBy({ by }) {
  if (by === "rules") return <span className="app-tag rules">Rules · no AI</span>;
  if (by === "jev") return <span className="app-tag rules">Rules + Jev</span>;
  return <span className="app-tag ai">AI read · person approved</span>;
}

function payoutState(r) {
  if (r.delivered >= r.amount && r.amount > 0) return "Delivered";
  if (r.status === "SUBMITTING") return "Sending";
  return r.payout_batch_id ? "Sent to PayPal" : "Approved";
}

function Login({ onPick }) {
  const [funders, setFunders] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [needsCode, setNeedsCode] = useState(null); // funder id waiting for an access code
  const [code, setCode] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [pickError, setPickError] = useState(null);
  const load = useCallback(() => {
    setFunders(null);
    setLoadError(null);
    api
      .funders()
      .then((d) => setFunders(d.funders))
      .catch((e) => setLoadError(e.message || "Couldn't load the funders."));
  }, []);
  useEffect(load, [load]);

  // Opening a session happens here so a deployment that wants an access code
  // can ask for it; in the demo it needs none.
  const pick = async (id, withCode) => {
    if (signingIn) return;
    setSigningIn(true);
    setPickError(null);
    try {
      await api.funderSession(id, withCode);
      onPick(id);
    } catch (e) {
      if (e.status === 401) {
        setNeedsCode(id);
        setPickError(withCode ? e.message || "That code wasn't accepted." : null);
      } else {
        setPickError(e.message);
      }
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="app-shell">
      <main className="app-wrap" style={{ maxWidth: 520, paddingTop: 48 }}>
        <img src="/logo-lockup.png" alt="Celerity" style={{ height: 40, objectFit: "contain", alignSelf: "flex-start" }} />
        <div>
          <h1 style={{ font: "var(--text-display)", margin: "8px 0 4px" }}>Funder app</h1>
          <p style={{ margin: 0, color: "var(--text-dim)" }}>Put money where the next storm will hit. Celerity decides who gets it; PayPal pays them.</p>
        </div>
        <div className="app-card" style={{ padding: 8 }}>
          {!funders && !loadError && <p style={{ padding: 14 }}><span className="cel-spin" /> Loading…</p>}
          {loadError && (
            <div role="alert" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <span style={{ color: "var(--bad-text)", fontWeight: 600 }}>Couldn't load the funders. {loadError}</span>
              <Button size="sm" variant="outline" onClick={load}>
                Try again
              </Button>
            </div>
          )}
          {funders?.map((f) => (
            <button
              key={f.id}
              onClick={() => pick(f.id)}
              disabled={signingIn}
              className="cel-press"
              style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", border: "none", background: "none", padding: 14, textAlign: "left", cursor: "pointer", borderRadius: 12, fontFamily: "var(--font-sans)" }}
            >
              <span className="app-avatar">{f.initials}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", font: "var(--text-body-lg)" }}>{f.name}</strong>
                <span style={{ font: "var(--text-meta)", color: "var(--text-faint)" }}>{f.desc}</span>
              </span>
              <span aria-hidden="true" style={{ color: "var(--text-faint)" }}>›</span>
            </button>
          ))}
        </div>
        {needsCode && (
          <form
            className="app-card cel-pop"
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) pick(needsCode, code.trim());
            }}
          >
            <label htmlFor="funder-code" style={{ font: "var(--text-fine)", color: "var(--text-dim)" }}>
              Access code for {funders?.find((x) => x.id === needsCode)?.name || "this institution"}
            </label>
            <input id="funder-code" className="app-input" type="password" autoComplete="off" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
            <Button type="submit" variant="outline" disabled={signingIn || !code.trim()}>
              {signingIn ? "Checking…" : "Continue"}
            </Button>
          </form>
        )}
        {pickError && <p role="alert" style={{ margin: 0, color: "var(--bad-text)", fontWeight: 600 }}>{pickError}</p>}
        <p style={{ margin: 0, font: "var(--text-fine)", color: "var(--text-faint)" }}>
          Demo institutions · PayPal sandbox · no real money. <a href="#/" style={{ color: "var(--primary)" }}>Back to Celerity</a>
        </p>
      </main>
    </div>
  );
}

function Releases({ releases, currency, empty }) {
  if (!releases.length) return <p style={{ margin: 0, color: "var(--text-faint)" }}>{empty}</p>;
  return (
    <ul className="app-list">
      {releases.map((r) => (
        <li key={`${r.batch_id}-${r.pool_id}`}>
          <span className="ico" aria-hidden="true">
            <Icon d={I.down} size={18} />
          </span>
          <span className="main">
            <span className="title">
              {stormName(r.storm)} · {r.families} famil{r.families === 1 ? "y" : "ies"}
            </span>
            <span className="meta" style={{ display: "block" }}>
              {r.pool_name} · {r.towns.slice(0, 3).join("; ")}
              {r.towns.length > 3 ? ` +${r.towns.length - 3}` : ""}
            </span>
            <span style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <DecidedBy by={r.decided_by} />
              <span className="app-tag muted">
                {payoutState(r)} · {when(r.at)}
              </span>
            </span>
          </span>
          <span className="amt">−{money(r.amount, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

function PoolCard({ pool, currency, onTopUp }) {
  const used = pool.contributed ? Math.min(100, Math.round((pool.committed / pool.contributed) * 100)) : 0;
  return (
    <div className="app-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ font: "var(--text-body-lg)" }}>{pool.name}</strong>
          <div style={{ font: "var(--text-meta)", color: "var(--text-faint)" }}>
            {pool.provinces.length ? pool.provinces.join(", ") : "Nationwide"} · pays at signal {pool.min_signal || 2}+
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => onTopUp(pool)}>
          Fund with PayPal
        </Button>
      </div>
      {pool.rule_text && (
        <p style={{ margin: "10px 0 0", font: "var(--text-meta)", color: "var(--text-dim)", fontStyle: "italic" }}>“{pool.rule_text}”</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginTop: 14 }}>
        {[
          ["Available", pool.available],
          ["Paid out", pool.committed],
          ["Put in", pool.contributed],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)" }}>{k}</div>
            <div style={{ font: "var(--text-money)", fontVariantNumeric: "tabular-nums" }}>{money(v, currency)}</div>
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ height: 6, borderRadius: 999, background: "var(--container)", marginTop: 12, overflow: "hidden" }}>
        <div style={{ width: `${used}%`, height: "100%", background: "var(--primary)" }} />
      </div>
      <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", marginTop: 6 }}>
        {pool.payouts.length} release{pool.payouts.length === 1 ? "" : "s"} · {pool.contributions.length} contribution{pool.contributions.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export default function FunderApp({ query }) {
  const [who, setWho] = useState(readWho);
  const [page, setPage] = useState("home");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // "new" | { topUp: pool }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Clearing the previous timer keeps an older toast from dismissing a newer one.
  const notify = useCallback((msg, isError = false, extra = {}) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, isError, ...extra });
    toastTimer.current = setTimeout(() => setToast(null), isError ? 12000 : 6000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // A lost funder session sends the funder back to the picker with a reason.
  const signOut = useCallback(
    (id, message) => {
      api.forgetFunder(id);
      saveWho("");
      setWho("");
      if (message) notify(message, true);
    },
    [notify]
  );

  const load = useCallback(() => {
    if (!who) return Promise.resolve();
    return api
      .funder(who)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (e.status === 404) signOut(who);
        else if (e.status === 401) signOut(who, "Your funder session ended. Pick your institution to sign in again.");
        else setError(e.message);
      });
  }, [who, signOut]);

  useEffect(() => {
    document.title = "Funder app · Celerity";
    setData(null);
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  // Back from PayPal Checkout.
  useEffect(() => {
    const q = new URLSearchParams(query || "");
    const funded = q.get("funded");
    if (!funded) return;
    if (funded === "cancelled") notify("Checkout cancelled. Nothing was charged.");
    else if (funded === "failed" || funded === "unknown") notify("PayPal didn't confirm that payment, so nothing was credited.", true);
    else if (funded === "pending") notify("PayPal is still processing your payment. It will be credited to the pool as soon as PayPal confirms it.", false, { neutral: true });
    else notify("", false, { amount: Number(q.get("amount")) || 0 });
    window.history.replaceState(null, "", "#/funder");
  }, [query, notify]);

  const f = data?.funder;
  const cur = data?.currency || "PHP";
  // The amount is formatted here, with the pool currency, not printed raw from the URL.
  const toastNode = toast && (
    <Toast
      error={toast.isError}
      neutral={toast.neutral}
      message={toast.amount != null ? `PayPal confirmed your payment of ${money(toast.amount, cur)}. The pool is credited.` : toast.msg}
    />
  );

  if (!who) {
    return (
      <>
        <Login
          onPick={(id) => {
            saveWho(id);
            setWho(id);
            setPage("home");
          }}
        />
        {toastNode}
      </>
    );
  }

  const titles = { pools: "My pools", ledger: "Ledger" };

  return (
    <div className="app-shell">
      <main className="app-wrap">
        <header className="app-head">
          {page === "home" ? (
            <div className="app-who">
              <span className="app-avatar">{f?.initials || "··"}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: "var(--text-body-lg)", fontWeight: 700 }}>{f?.name || "Loading…"}</div>
                <div style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>Funder · PayPal sandbox</div>
              </div>
            </div>
          ) : (
            <div className="app-who">
              <button className="app-pill" onClick={() => setPage("home")} aria-label="Back to home" style={{ padding: 10 }}>
                <Icon d={I.back} size={17} />
              </button>
              <h1 style={{ margin: 0, font: "var(--text-h1)" }}>{titles[page]}</h1>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="app-pill" href="#/farmer">
              <Icon d={I.phone} size={15} /> Farmer app
            </a>
            <a className="app-pill" href="#/public">
              <Icon d={I.globe} size={15} /> Public ledger
            </a>
            <button
              className="app-avatar cel-press"
              title="Switch institution"
              style={{ width: 40, height: 40, cursor: "pointer" }}
              onClick={() => signOut(who)}
            >
              {f?.initials || "··"}
            </button>
          </div>
        </header>

        {error && <p role="alert" style={{ color: "var(--bad-text)", margin: 0 }}>{error}</p>}
        {!data && !error && (
          <p style={{ color: "var(--text-faint)" }}>
            <span className="cel-spin" /> Loading your pools…
          </p>
        )}

        {data && page === "home" && (
          <div key="home" className="cel-swap" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <section className="app-hero">
              <div className="label">Ready for the next storm</div>
              <div className="big">{money(data.totals.available, cur)}</div>
              <div className="sub">
                {data.pools.length} pool{data.pools.length === 1 ? "" : "s"} · {money(data.totals.contributed, cur)} put in · {money(data.totals.committed, cur)} paid to families
              </div>
              <div className="app-hero-actions">
                <button className="app-hero-btn" onClick={() => setModal("new")}>
                  <Icon d={I.plus} size={18} /> New pool
                </button>
                <button className="app-hero-btn" onClick={() => (data.pools[0] ? setModal({ topUp: data.pools[0] }) : setModal("new"))}>
                  <Icon d={I.up} size={18} /> Cash in with PayPal
                </button>
              </div>
            </section>

            <nav className="app-card app-quick" aria-label="Funder app">
              <button onClick={() => setPage("pools")}>
                <span className="ico"><Icon d={I.pools} /></span>My pools
              </button>
              <button onClick={() => setPage("ledger")}>
                <span className="ico"><Icon d={I.ledger} /></span>Ledger
              </button>
              <a href="#/farmer">
                <span className="ico"><Icon d={I.phone} /></span>Farmer app
              </a>
              <a href="#/public">
                <span className="ico"><Icon d={I.globe} /></span>Public ledger
              </a>
            </nav>

            <section className="app-card">
              <h2 style={{ margin: "0 0 10px", font: "var(--text-h2)" }}>How your money moves</h2>
              <div className="app-flow">
                <div><b>1 · You</b>Pick where and at what wind signal. PayPal Checkout cashes you in.</div>
                <div><b>2 · Rules</b>Java-checked rules read routine PAGASA bulletins and decide who qualifies and how much.</div>
                <div><b>3 · AI</b>Agents read only what rules can't: odd bulletins, your words, farmers' questions. A person approves every AI draft.</div>
                <div><b>4 · PayPal</b>Payouts to each family, tracked here to the town.</div>
              </div>
            </section>

            <div className="app-section">
              <h2>Where your money went</h2>
              {data.releases.length > 0 && (
                <button className="app-pill" onClick={() => setPage("ledger")}>
                  See all
                </button>
              )}
            </div>
            <section className="app-card">
              <Releases releases={data.releases.slice(0, 5)} currency={cur} empty="No releases yet. When a storm meets one of your pools' rules, the payouts show up here." />
            </section>
          </div>
        )}

        {data && page === "pools" && (
          <div key="pools" className="cel-swap" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ margin: 0, color: "var(--text-dim)" }}>Only your pools. Each one pays registered families in its provinces when PAGASA's wind signal reaches its rule.</p>
            {data.pools.map((p) => (
              <PoolCard key={p.id} pool={p} currency={cur} onTopUp={(pool) => setModal({ topUp: pool })} />
            ))}
            <Button variant="outline" onClick={() => setModal("new")} icon={<Icon d={I.plus} size={16} />}>
              New pool
            </Button>
          </div>
        )}

        {data && page === "ledger" && (
          <div key="ledger" className="cel-swap app-card">
            <Releases releases={data.releases} currency={cur} empty="No releases yet." />
          </div>
        )}
      </main>

      {modal === "new" && data && (
        <NewPoolModal
          funder={f}
          notify={notify}
          onAuthLost={() => signOut(who, "Your funder session ended. Pick your institution to sign in again.")}
          onClose={() => setModal(null)}
          onCreated={(pool) => {
            load();
            setPage("pools");
            setModal({ topUp: { ...pool, payouts: [], contributions: [] } });
          }}
        />
      )}
      {modal?.topUp && data && <TopUpModal funder={f} pool={modal.topUp} limits={data.limits} currency={cur} onClose={() => setModal(null)} />}
      {toastNode}
    </div>
  );
}
