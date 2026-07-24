import React, { useState } from "react";
import Button from "../../design/Button";
import { toPHPNumber, DEMO_USDPHP } from "../../lib/anchor";
import { createSep31Transaction, pollSep31Status, sep31Chip, SEP31_LABEL } from "../../lib/sep31";

const DESTINATIONS = [
  { key: "gcash", icon: "📱", title: "GCash", subtitle: "Send to a GCash number" },
  { key: "bank", icon: "🏦", title: "Bank account", subtitle: "BDO, Landbank, and other banks" },
  { key: "nearby", icon: "🏪", title: "Cash pick-up nearby", subtitle: "Barangay San Isidro Co-op, 0.4 km away" },
];

// One question per screen. GCash/bank: dest → recipient → (number → name if
// new) → amount → confirm. Nearby: dest → amount → confirm.
const STEP = {
  DEST: "dest",
  RECIPIENT: "recipient",
  NUMBER: "number",
  NAME: "name",
  AMOUNT: "amount",
  CONFIRM: "confirm",
  LOADING: "loading",
  SUCCESS: "success",
};

// --- input filters (strip disallowed chars as the user types) ---
const digitsOnly = (s) => s.replace(/\D/g, "");
const lettersOnly = (s) => s.replace(/[^\p{L} .'-]/gu, "");

// --- validators ---
const isValidGcash = (s) => {
  const d = digitsOnly(s);
  return /^09\d{9}$/.test(d) || /^9\d{9}$/.test(d);
};
const isValidName = (s) => /^[\p{L}][\p{L} .'-]*$/u.test(s.trim()) && s.trim().length > 1;
const isValidBankAccount = (s) => digitsOnly(s).length >= 6;

const fmtNumber = (d) => (d && d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : d);

/** Fully simulated cash-out — no real transfer happens. Honest stub: the
 * escrow/trigger/release above this screen is live on-chain, this leg is not.
 * Redesigned as a one-thing-per-screen wizard for low digital literacy. */
export default function CashOutFlow({ availableUnits, recipients = [], onCashedOut, onClose }) {
  const [step, setStep] = useState(STEP.DEST);
  const [dest, setDest] = useState(null);
  // recipient being sent to: { name, detail, bank? }. isNew tracks whether we
  // collected it via the number/name screens (so we save it afterwards).
  const [to, setTo] = useState({ name: "", detail: "", bank: "" });
  const [isNew, setIsNew] = useState(false);
  const [amount, setAmount] = useState("");
  const [sepStatus, setSepStatus] = useState(null);

  const availablePhpNumber = Math.round(toPHPNumber(availableUnits));
  const enteredPhp = Number((amount || "").replace(/[^0-9]/g, "")) || 0;
  const overBalance = enteredPhp > availablePhpNumber;

  const destTitle = dest ? DESTINATIONS.find((d) => d.key === dest).title : "";
  const savedFor = (d) => recipients.filter((r) => r.dest === d);

  const setAmountValue = (raw) => {
    const digits = raw.replace(/[^0-9]/g, "");
    setAmount(digits === "" ? "" : Number(digits).toLocaleString());
  };

  // --- navigation ---
  const chooseDest = (key) => {
    setDest(key);
    if (key === "nearby") {
      setTo({ name: "Barangay San Isidro Co-op", detail: "R5-SANISIDRO-7719", bank: "" });
      setIsNew(false);
      setStep(STEP.AMOUNT);
    } else {
      setStep(STEP.RECIPIENT);
    }
  };
  const pickSaved = (r) => {
    setTo({ name: r.name || "", detail: r.detail, bank: r.bank || "" });
    setIsNew(false);
    setStep(STEP.AMOUNT); // known recipient → straight to amount
  };
  const startNew = () => {
    setTo({ name: "", detail: "", bank: "" });
    setIsNew(true);
    setStep(STEP.NUMBER);
  };

  const back = () => {
    switch (step) {
      case STEP.DEST: return onClose();
      case STEP.RECIPIENT: return setStep(STEP.DEST);
      case STEP.NUMBER: return setStep(STEP.RECIPIENT);
      case STEP.NAME: return setStep(STEP.NUMBER);
      case STEP.AMOUNT: return setStep(isNew ? STEP.NAME : dest === "nearby" ? STEP.DEST : STEP.RECIPIENT);
      case STEP.CONFIRM: return setStep(STEP.AMOUNT);
      default: return onClose();
    }
  };

  const destLabel = dest === "gcash" ? "GCash" : dest === "bank" ? "bank account" : "Barangay San Isidro Co-op";

  const confirmSend = async () => {
    setStep(STEP.LOADING);
    setSepStatus("pending_sender");
    try {
      const tx = await createSep31Transaction({
        amountPhp: enteredPhp,
        dest,
        receiver: { name: to.name, detail: digitsOnly(to.detail) || to.detail },
        onStatus: setSepStatus,
      });
      await pollSep31Status(tx, setSepStatus);
      onCashedOut &&
        onCashedOut({
          units: enteredPhp / DEMO_USDPHP,
          php: enteredPhp,
          destLabel,
          dest,
          detail: digitsOnly(to.detail) || to.detail,
          name: to.name,
          sep31Id: tx.id,
        });
      setStep(STEP.SUCCESS);
    } catch {
      setStep(STEP.CONFIRM);
      setSepStatus(null);
    }
  };

  const numberValid = isValidGcash(to.detail);
  const nameValid = isValidName(to.name);

  return (
    <div className="cel-overlay" style={{ position: "absolute", inset: 0, background: "var(--paper-page)", display: "flex", flexDirection: "column", zIndex: 20 }}>
      {step !== STEP.LOADING && step !== STEP.SUCCESS && <TopBar onBack={back} />}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 22px 24px", display: "flex", flexDirection: "column" }}>
        {/* 1 — pick where the money goes */}
        {step === STEP.DEST && (
          <Step title="Where do you want your money?" hint="Choose one.">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {DESTINATIONS.map((d) => (
                <BigChoice key={d.key} emoji={d.icon} title={d.title} subtitle={d.subtitle} onClick={() => chooseDest(d.key)} />
              ))}
            </div>
            <Honesty text={`${SEP31_LABEL}. Demo only — production uses a licensed VASP (PDAX) converting settlement asset → real pesos.`} />
          </Step>
        )}

        {/* 2 — who is it going to */}
        {step === STEP.RECIPIENT && (
          <Step title={`Send ${destTitle} to who?`} hint="Pick someone you've sent to before, or add new.">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {savedFor(dest).map((r) => (
                <BigChoice
                  key={r.id}
                  avatar={(r.name || "?").trim().charAt(0).toUpperCase()}
                  title={r.name || "Saved recipient"}
                  subtitle={r.dest === "bank" ? `${r.bank ? r.bank + " · " : ""}${r.detail}` : fmtNumber(r.detail)}
                  onClick={() => pickSaved(r)}
                />
              ))}
              <BigChoice emoji="➕" title={dest === "bank" ? "New bank account" : "New number"} subtitle="Send to someone new" onClick={startNew} muted />
            </div>
          </Step>
        )}

        {/* 3a — enter the number (new recipient) */}
        {step === STEP.NUMBER && (
          <Step
            title={dest === "bank" ? "What's the account number?" : "What's the GCash number?"}
            hint={dest === "bank" ? "Type the numbers only." : "Type an 11-digit mobile number."}
          >
            <BigInput
              value={to.detail}
              onChange={(v) => setTo((t) => ({ ...t, detail: dest === "bank" ? digitsOnly(v) : digitsOnly(v) }))}
              placeholder={dest === "bank" ? "0000 0000 0000" : "09XX XXX XXXX"}
              inputMode="numeric"
              autoFocus
            />
            <div style={{ flex: 1 }} />
            <BigButton
              disabled={dest === "bank" ? !isValidBankAccount(to.detail) : !numberValid}
              onClick={() => setStep(STEP.NAME)}
            >
              Next
            </BigButton>
          </Step>
        )}

        {/* 3b — enter the name (new recipient) */}
        {step === STEP.NAME && (
          <Step title="What's their name?" hint="The name on the account.">
            <BigInput
              value={to.name}
              onChange={(v) => setTo((t) => ({ ...t, name: lettersOnly(v) }))}
              placeholder="Full name"
              autoFocus
            />
            <div style={{ flex: 1 }} />
            <BigButton disabled={!nameValid} onClick={() => setStep(STEP.AMOUNT)}>
              Next
            </BigButton>
          </Step>
        )}

        {/* 4 — how much */}
        {step === STEP.AMOUNT && (
          <Step title="How much?" hint={`You have ₱${availablePhpNumber.toLocaleString()} to cash out.`}>
            {dest === "nearby" && <QrCard code={to.detail} />}
            <AmountEntry amount={amount} setAmount={setAmountValue} maxPhp={availablePhpNumber} overBalance={overBalance} />
            <div style={{ flex: 1 }} />
            <BigButton disabled={enteredPhp <= 0 || overBalance} onClick={() => setStep(STEP.CONFIRM)}>
              Next
            </BigButton>
          </Step>
        )}

        {/* 5 — confirm */}
        {step === STEP.CONFIRM && (
          <Step title="Does this look right?" hint="Check before you send.">
            <div style={confirmCard}>
              <div style={{ font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)", textAlign: "center" }}>You're sending</div>
              <div style={{ font: "var(--text-hero)", fontSize: 44, color: "var(--primary)", textAlign: "center", fontVariantNumeric: "tabular-nums", margin: "4px 0 10px" }}>₱{amount}</div>
              <div style={{ height: 1, background: "var(--container-highest)", margin: "4px 0 14px" }} />
              <ConfirmRow k="To" v={to.name || destTitle} />
              <ConfirmRow k={dest === "bank" ? "Account" : dest === "nearby" ? "Pick-up code" : "Number"} v={dest === "nearby" ? to.detail : dest === "bank" ? to.detail : fmtNumber(to.detail)} />
              <ConfirmRow k="Where" v={destTitle} last />
            </div>
            <div style={{ flex: 1 }} />
            <BigButton onClick={confirmSend}>Send ₱{amount}</BigButton>
          </Step>
        )}

        {/* loading — SEP-31 status machine */}
        {step === STEP.LOADING && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center" }}>
            <Spinner />
            <div style={{ font: "var(--text-h2)", fontSize: 19 }}>Cash-out to {to.name || destTitle}…</div>
            <div
              style={{
                marginTop: 4,
                padding: "6px 12px",
                borderRadius: 999,
                background: "var(--container)",
                font: "var(--text-fine)",
                fontWeight: 700,
                color: "var(--primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              SEP-31 · {sep31Chip(sepStatus)}
            </div>
            <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", maxWidth: 280 }}>{SEP31_LABEL}</div>
          </div>
        )}

        {/* success — honest mock completion, not live InstaPay */}
        {step === STEP.SUCCESS && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: "32px 8px" }}>
              <div className="cel-pop" style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--ok-bg)", color: "var(--ok-text)", fontSize: 40, display: "grid", placeItems: "center", marginBottom: 8 }}>✓</div>
              <div style={{ font: "var(--text-h2)", fontSize: 20 }}>SEP-31 mock completed</div>
              <div style={{ font: "var(--text-hero)", fontSize: 34, color: "var(--ok-text)", margin: "8px 0", fontVariantNumeric: "tabular-nums" }}>₱{amount}</div>
              <div style={{ font: "var(--text-body)", fontSize: 14, color: "var(--text-dim)", maxWidth: 280 }}>
                Demo cash-out to {to.name || destTitle} ({destTitle}). In production PDAX would pay real pesos here.
              </div>
              <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", marginTop: 4 }}>{SEP31_LABEL}</div>
            </div>
            <BigButton onClick={onClose}>Done</BigButton>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- building blocks ---------------- */

function TopBar({ onBack }) {
  return (
    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 4px" }}>
      <button onClick={onBack} aria-label="Back" className="cel-press" style={backBtnStyle}>←</button>
    </div>
  );
}

function Step({ title, hint, children }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <h1 style={{ font: "var(--text-h1)", fontSize: 24, color: "var(--text)", margin: "8px 0 4px", letterSpacing: "var(--tracking-tight)", textWrap: "balance" }}>{title}</h1>
      {hint && <p style={{ font: "var(--text-body)", fontSize: 14.5, color: "var(--text-dim)", margin: "0 0 20px", lineHeight: 1.45 }}>{hint}</p>}
      {children}
    </div>
  );
}

function BigChoice({ emoji, avatar, title, subtitle, onClick, muted }) {
  return (
    <button onClick={onClick} className="cel-row" style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", background: "#fff", border: `1.5px solid ${muted ? "var(--outline)" : "var(--container-highest)"}`, borderStyle: muted ? "dashed" : "solid", borderRadius: "var(--radius-card)", padding: "16px 16px", cursor: "pointer", fontFamily: "var(--font-sans)", boxShadow: muted ? "none" : "var(--shadow-card)" }}>
      <div style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: "grid", placeItems: "center", background: avatar ? "rgba(22,69,45,0.12)" : "var(--container)", color: "var(--primary)", fontSize: avatar ? 18 : 22, fontWeight: 700 }}>
        {avatar || emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--text-body-lg)", fontSize: 16, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {subtitle && <div style={{ font: "var(--text-fine)", fontSize: 13, color: "var(--text-faint)", marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{subtitle}</div>}
      </div>
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: "var(--text-faint)" }}><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

function BigInput({ value, onChange, placeholder, inputMode, autoFocus }) {
  return (
    <input
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        background: "#fff",
        border: "1.5px solid var(--container-highest)",
        borderRadius: "var(--radius-card)",
        padding: "18px 18px",
        fontFamily: "var(--font-sans)",
        fontSize: 22,
        fontWeight: 600,
        color: "var(--text)",
        fontVariantNumeric: "tabular-nums",
        outline: "none",
        boxSizing: "border-box",
      }}
    />
  );
}

function AmountEntry({ amount, setAmount, maxPhp, overBalance }) {
  const chips = [100, 500].filter((c) => c <= maxPhp);
  return (
    <div>
      <div style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", border: overBalance ? "1.5px solid var(--bad-line)" : "1.5px solid var(--container-highest)", padding: "26px 20px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span style={{ font: "var(--text-hero)", fontSize: 40, color: overBalance ? "var(--bad-text)" : "var(--text)" }}>₱</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={amount}
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
            style={{ border: "none", outline: "none", background: "transparent", font: "var(--text-hero)", fontSize: 48, color: overBalance ? "var(--bad-text)" : "var(--text)", width: 200, textAlign: "center", fontVariantNumeric: "tabular-nums" }}
          />
        </div>
        {overBalance && (
          <div style={{ font: "var(--text-fine)", color: "var(--bad-text)", marginTop: 6 }}>
            That's more than you have.
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {chips.map((c) => (
          <button key={c} onClick={() => setAmount(String(c))} className="cel-press" style={chipStyle(false)}>₱{c.toLocaleString()}</button>
        ))}
        <button onClick={() => setAmount(String(maxPhp))} className="cel-press" style={chipStyle(true)}>All ₱{maxPhp.toLocaleString()}</button>
      </div>
    </div>
  );
}

function ConfirmRow({ k, v, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: last ? "none" : "1px solid var(--surface-low)", font: "var(--text-table)", fontSize: 14.5 }}>
      <span style={{ color: "var(--text-faint)", fontWeight: 600 }}>{k}</span>
      <span style={{ color: "var(--text)", fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", maxWidth: "62%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
    </div>
  );
}

function BigButton({ children, onClick, disabled }) {
  return (
    <Button variant="primary" className="cel-press" disabled={disabled} onClick={onClick} style={{ width: "100%", justifyContent: "center", fontSize: 18, minHeight: 56, marginTop: 12 }}>
      {children}
    </Button>
  );
}

function QrCard({ code }) {
  const cells = React.useMemo(() => Array.from({ length: 49 }, (_, i) => (i * 7 + 3) % 5 < 2), []);
  return (
    <div style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", marginBottom: 14 }}>
      <div style={{ width: 156, height: 156, borderRadius: 14, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: "repeat(7, 1fr)", gap: 4, padding: 12, background: "#fff", border: "1.5px solid var(--container-highest)" }}>
        {cells.map((on, i) => (
          <span key={i} style={{ background: on ? "var(--text)" : "transparent", borderRadius: 2 }} />
        ))}
      </div>
      <div style={{ font: "var(--text-body-lg)", fontSize: 14, fontWeight: 700 }}>Show this to the co-op officer</div>
      <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", letterSpacing: "0.03em" }}>CODE {code}</div>
    </div>
  );
}

function Honesty({ text }) {
  return <p style={{ font: "var(--text-fine)", color: "var(--text-faint)", textAlign: "center", padding: "16px 4px 0", marginTop: "auto" }}>{text}</p>;
}

function Spinner() {
  return (
    <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid var(--container-highest)", borderTopColor: "var(--primary)", animation: "cashout-spin 0.7s linear infinite", marginBottom: 8 }}>
      <style>{"@keyframes cashout-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

const backBtnStyle = {
  width: 38,
  height: 38,
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "var(--shadow-card)",
  border: "none",
  fontSize: 17,
  color: "var(--text)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};

const confirmCard = {
  background: "#fff",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  border: "1px solid var(--container-highest)",
  padding: "20px 18px",
};

const chipStyle = (primary) => ({
  flex: 1,
  background: primary ? "var(--primary)" : "var(--container)",
  color: primary ? "var(--on-primary)" : "var(--primary)",
  border: "none",
  borderRadius: "var(--radius-control)",
  padding: "12px 4px",
  fontWeight: 700,
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
});
