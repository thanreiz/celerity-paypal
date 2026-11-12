import React, { useEffect, useId, useState } from "react";
import Button from "../../design/Button";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import { useDialog } from "../../lib/useDialog";

const EXAMPLES = [
  "Rice farmers across Bicol when a storm reaches Signal 3 or higher.",
  "Eastern Visayas families at Signal 4+, paid in 3 monthly installments, max ₱200,000 per storm.",
  "Anyone in Catanduanes once PAGASA raises any wind signal.",
];

function Modal({ title, onClose, children }) {
  // Escape closes, focus moves in and stays in, and goes back on close.
  const ref = useDialog(onClose);
  return (
    <div className="app-modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="app-modal cel-pop" style={{ outline: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, font: "var(--text-h2)" }}>{title}</h2>
          <button className="app-pill" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Plain words in, a rule the code has checked out. The pool exists only
 * after the funder confirms. */
export function NewPoolModal({ funder, onClose, onCreated, notify, onAuthLost }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    setDraft(null);
    try {
      setDraft(await api.draftPool(funder.id, text));
    } catch (e) {
      if (e.status === 401) return onAuthLost?.();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const pool = await api.createFunderPool(funder.id, { ...draft.proposal, rule_text: text });
      notify(`Pool "${pool.name}" created. Fund it with PayPal to make it live.`);
      onCreated(pool);
    } catch (e) {
      if (e.status === 401) return onAuthLost?.();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const p = draft?.proposal;
  return (
    <Modal title="New relief pool" onClose={onClose}>
      <p style={{ margin: "0 0 12px", color: "var(--text-dim)", font: "var(--text-meta)" }}>
        Say where your money should go and how strong a storm must be. The AI turns it into a rule; Celerity's rules check it before anything exists.
      </p>
      <textarea
        className="app-textarea"
        value={text}
        maxLength={600}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Rice farmers in Bicol when the storm reaches Signal 3"
        aria-label="Describe your pool"
      />
      <div className="app-chips" style={{ marginTop: 10 }}>
        {EXAMPLES.map((ex) => (
          <button key={ex} className="app-chip" onClick={() => setText(ex)}>
            {ex}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <Button onClick={ask} disabled={busy || text.trim().length < 8} variant="outline">
          {busy && !draft ? <span className="cel-spin" /> : "✦"} Draft the rule with AI
        </Button>
      </div>

      {error && (
        <p role="alert" style={{ marginTop: 14, padding: "10px 14px", borderRadius: 12, background: "var(--bad-bg)", color: "var(--bad-text)", fontWeight: 600 }}>
          {error}
        </p>
      )}

      {draft && !p && (
        <p style={{ marginTop: 14, color: "var(--text-dim)" }}>{draft.note || "The assistant couldn't turn that into a rule Celerity can enforce. Try naming provinces or a region."}</p>
      )}

      {p && (
        <div className="app-card cel-fadein" style={{ marginTop: 16, background: "var(--surface-low)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
            <strong style={{ font: "var(--text-body-lg)" }}>{p.name}</strong>
            <span className="app-tag rules">✓ Checked by Celerity rules</span>
          </div>
          <dl style={{ margin: "12px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", font: "var(--text-meta)" }}>
            <dt style={{ color: "var(--text-faint)" }}>Where</dt>
            <dd style={{ margin: 0 }}>{p.provinces.length ? p.provinces.join(", ") : "Nationwide"}</dd>
            <dt style={{ color: "var(--text-faint)" }}>When</dt>
            <dd style={{ margin: 0 }}>PAGASA wind signal {p.min_signal} or higher</dd>
            <dt style={{ color: "var(--text-faint)" }}>Reaches</dt>
            <dd style={{ margin: 0 }}>{p.families_covered} registered famil{p.families_covered === 1 ? "y" : "ies"} today</dd>
            <dt style={{ color: "var(--text-faint)" }}>How much</dt>
            <dd style={{ margin: 0 }}>Program policy sets each family's amount and caps it</dd>
          </dl>
          {p.not_enforced.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "var(--warn-bg)", color: "var(--warn-text)", font: "var(--text-meta)" }}>
              <strong>Celerity can't enforce:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {p.not_enforced.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {draft.note && <p style={{ margin: "12px 0 0", font: "var(--text-meta)", color: "var(--text-dim)" }}>{draft.note}</p>}
          <p style={{ margin: "10px 0 0", font: "var(--text-fine)", color: "var(--text-faint)" }}>
            Drafted by {draft.model} in {draft.steps.length} step{draft.steps.length === 1 ? "" : "s"}
            {draft.steps.some((s) => !s.ok) ? `, ${draft.steps.filter((s) => !s.ok).length} refused by the rules and fixed` : ""}.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <Button variant="primary" onClick={create} disabled={busy}>
              Create pool
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              Change it
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Cash in: PayPal Checkout. The pool is credited only when PayPal reports
 * the capture. */
export function TopUpModal({ funder, pool, limits, currency, onClose }) {
  const [amount, setAmount] = useState(String(currency === "PHP" ? 5000 : 100));
  const [name, setName] = useState(funder.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const uid = useId();
  const amountId = `${uid}-amount`;
  const nameId = `${uid}-name`;
  const hintId = `${uid}-hint`;

  // The API gives the limits; if it did not, the server's rule is 100 to
  // 1,000,000 in the pool currency, two decimals at most.
  const min = Number.isFinite(Number(limits?.min)) ? Number(limits.min) : 100;
  const max = Number.isFinite(Number(limits?.max)) ? Number(limits.max) : 1000000;
  const n = amount.trim() === "" ? NaN : Number(amount);
  const twoDecimals = Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
  const valid = Number.isFinite(n) && n >= min && n <= max && twoDecimals;
  const showRange = amount.trim() !== "" && !valid;

  // Coming back from PayPal with the back button can restore this page from
  // the back/forward cache with busy still set; clear it so Pay works again.
  useEffect(() => {
    const onShow = (e) => e.persisted && setBusy(false);
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const go = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const { approveUrl } = await api.fundPool(pool.id, name.trim(), n, "funder");
      window.location.assign(approveUrl);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal title={`Fund ${pool.name}`} onClose={onClose}>
      <p style={{ margin: "0 0 14px", color: "var(--text-dim)", font: "var(--text-meta)" }}>
        You pay with PayPal Checkout (sandbox). The money sits in this pool until a storm meets its rule; whatever isn't paid out stays yours to see on the ledger.
      </p>
      <label htmlFor={amountId} style={{ display: "block", font: "var(--text-fine)", color: "var(--text-dim)", marginBottom: 6 }}>Amount ({currency})</label>
      <input
        id={amountId}
        className="app-input"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-invalid={showRange || undefined}
        aria-describedby={showRange ? hintId : undefined}
      />
      {showRange && (
        <p id={hintId} role="alert" style={{ margin: "6px 0 0", font: "var(--text-fine)", color: "var(--bad-text)", fontWeight: 600 }}>
          Enter an amount from {money(min, currency)} to {money(max, currency)}, with at most two decimals.
        </p>
      )}
      <div className="app-chips" style={{ marginTop: 8 }}>
        {(currency === "PHP" ? [1000, 5000, 25000] : [100, 250, 1000]).map((v) => (
          <button key={v} type="button" className="app-chip" onClick={() => setAmount(String(v))}>
            {money(v, currency)}
          </button>
        ))}
      </div>
      <label htmlFor={nameId} style={{ display: "block", font: "var(--text-fine)", color: "var(--text-dim)", margin: "14px 0 6px" }}>Shown on the public ledger as</label>
      <input id={nameId} className="app-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      {error && (
        <p role="alert" style={{ marginTop: 12, color: "var(--bad-text)", fontWeight: 600 }}>
          {error}
        </p>
      )}
      <Button variant="primary" onClick={go} disabled={busy || !name.trim() || !valid} style={{ marginTop: 16, width: "100%", background: "#003087" }}>
        {busy ? <span className="cel-spin" /> : null} {valid ? `Pay ${money(n, currency)} with PayPal` : "Pay with PayPal"}
      </Button>
    </Modal>
  );
}
