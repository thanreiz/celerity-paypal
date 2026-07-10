import React, { useState } from "react";
import Button from "../../design/Button";
import { toPHP } from "../../lib/anchor";

const DESTINATIONS = [
  { key: "gcash", icon: "📱", title: "GCash", subtitle: "Send to a GCash number" },
  { key: "bank", icon: "🏦", title: "Bank account", subtitle: "BDO, Landbank, and other partner banks" },
  { key: "nearby", icon: "🏪", title: "Nearby cash-out point", subtitle: "Barangay San Isidro Co-op, 0.4 km away" },
];

const STEPS = { PICKER: "picker", DETAIL: "detail", LOADING: "loading", SUCCESS: "success" };

/** Fully simulated cash-out — no real transfer happens. Honest stub: the
 * escrow/trigger/release above this screen is live on-chain, this leg is not. */
export default function CashOutFlow({ availableUnits, onClose }) {
  const [step, setStep] = useState(STEPS.PICKER);
  const [dest, setDest] = useState("gcash");
  const [fields, setFields] = useState({});
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState(null);

  const availablePhp = toPHP(availableUnits);
  const destMeta = DESTINATIONS.find((d) => d.key === dest);

  const setField = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));
  const setAmountValue = (raw) => {
    const digits = raw.replace(/[^0-9]/g, "");
    setAmount(digits === "" ? "" : Number(digits).toLocaleString());
  };

  const formReady = () => {
    if (amount.trim() === "") return false;
    if (dest === "gcash") return (fields.gcashNumber || "").trim().length >= 10 && (fields.gcashName || "").trim().length > 1;
    if (dest === "bank") return (fields.bankName || "").trim().length > 1 && (fields.bankAccount || "").trim().length >= 6 && (fields.bankAccountName || "").trim().length > 1;
    return true; // nearby: amount only
  };

  const destLabel = () => {
    if (dest === "gcash") return "GCash";
    if (dest === "bank") return "bank account";
    return "Barangay San Isidro Co-op";
  };

  const submit = () => {
    setResult({ amount, destLabel: destLabel() });
    setStep(STEPS.LOADING);
    setTimeout(() => setStep(STEPS.SUCCESS), 1100);
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--paper-page)", display: "flex", flexDirection: "column", zIndex: 20 }}>
      {(step === STEPS.PICKER || step === STEPS.DETAIL) && (
        <SubBar
          title={step === STEPS.PICKER ? "Cash Out" : `Send to ${destMeta.title}`}
          onBack={step === STEPS.PICKER ? onClose : () => setStep(STEPS.PICKER)}
        />
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {step === STEPS.PICKER && (
          <>
            <AmountCard label="Available to cash out" value={availablePhp} note="You'll choose how much on the next step" />
            <p style={{ margin: "4px 2px 0", font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase" }}>
              Choose where to send it
            </p>
            {DESTINATIONS.map((d) => (
              <DestOption key={d.key} data={d} selected={dest === d.key} onSelect={() => setDest(d.key)} />
            ))}
            <Button variant="primary" style={{ justifyContent: "center", marginTop: 4 }} onClick={() => setStep(STEPS.DETAIL)}>
              Continue
            </Button>
            <Honesty text="This routes through a simulated cash-out partner for the demo — in production this is a licensed Stellar anchor converting your balance to real pesos." />
          </>
        )}

        {step === STEPS.DETAIL && dest === "gcash" && (
          <>
            <Field label="GCash mobile number" placeholder="09XX XXX XXXX" value={fields.gcashNumber || ""} onChange={setField("gcashNumber")} />
            <Field label="Account name" placeholder="Full name on the GCash account" value={fields.gcashName || ""} onChange={setField("gcashName")} />
            <AmountInput amount={amount} setAmount={setAmountValue} maxUnits={availableUnits} />
            <Button variant="primary" disabled={!formReady()} style={{ justifyContent: "center" }} onClick={submit}>
              Continue
            </Button>
          </>
        )}

        {step === STEPS.DETAIL && dest === "bank" && (
          <>
            <Field label="Bank" placeholder="e.g. BDO, Landbank" value={fields.bankName || ""} onChange={setField("bankName")} />
            <Field label="Account number" placeholder="0000 0000 0000" value={fields.bankAccount || ""} onChange={setField("bankAccount")} />
            <Field label="Account name" placeholder="Full name on the account" value={fields.bankAccountName || ""} onChange={setField("bankAccountName")} />
            <AmountInput amount={amount} setAmount={setAmountValue} maxUnits={availableUnits} />
            <Button variant="primary" disabled={!formReady()} style={{ justifyContent: "center" }} onClick={submit}>
              Continue
            </Button>
          </>
        )}

        {step === STEPS.DETAIL && dest === "nearby" && (
          <>
            <QrCard code="R5-SANISIDRO-7719" />
            <AmountInput amount={amount} setAmount={setAmountValue} maxUnits={availableUnits} />
            <Button variant="primary" disabled={!formReady()} style={{ justifyContent: "center" }} onClick={submit}>
              Generate code & continue
            </Button>
            <Honesty text="The co-op officer scans this code to hand you the cash on the spot — the amount is deducted the moment they confirm." />
          </>
        )}

        {step === STEPS.LOADING && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center" }}>
            <Spinner />
            <div style={{ font: "var(--text-h2)", fontSize: 19 }}>Sending to {result?.destLabel}…</div>
            <div style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>This only takes a moment.</div>
          </div>
        )}

        {step === STEPS.SUCCESS && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: "32px 12px" }}>
              <div style={{ width: 74, height: 74, borderRadius: "50%", background: "var(--ok-bg)", color: "var(--ok-text)", fontSize: 34, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                ✓
              </div>
              <div style={{ font: "var(--text-h2)", fontSize: 19 }}>Cash out complete</div>
              <div style={{ font: "var(--text-hero)", fontSize: 30, color: "var(--ok-text)", margin: "10px 0", fontVariantNumeric: "tabular-nums" }}>
                ₱{result?.amount}
              </div>
              <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", maxWidth: 260 }}>
                Sent to {result?.destLabel}. It should arrive within a few minutes.
              </div>
            </div>
            <Button variant="primary" style={{ justifyContent: "center" }} onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubBar({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 8px" }}>
      <button
        onClick={onBack}
        aria-label="Back"
        style={{ width: 34, height: 34, borderRadius: "50%", background: "#fff", boxShadow: "var(--shadow-card)", border: "none", fontSize: 16, color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
      >
        ←
      </button>
      <div style={{ font: "var(--text-h2)", fontSize: 18 }}>{title}</div>
    </div>
  );
}

function AmountCard({ label, value, note }) {
  return (
    <div style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 20, textAlign: "center" }}>
      <div style={{ font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ font: "var(--text-hero)", fontSize: 34, color: "var(--text)", margin: "6px 0 2px", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>{note}</div>
    </div>
  );
}

function DestOption({ data, selected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      style={{
        background: "#fff",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
        border: selected ? "2px solid var(--primary)" : "2px solid transparent",
        textAlign: "left",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--container)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>
        {data.icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ font: "var(--text-body-lg)", fontSize: 14, fontWeight: 700 }}>{data.title}</div>
        <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", marginTop: 1 }}>{data.subtitle}</div>
      </div>
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          border: selected ? "none" : "2px solid var(--outline)",
          background: selected ? "var(--primary)" : "transparent",
          color: "#fff",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {selected && "✓"}
      </div>
    </button>
  );
}

function Field({ label, placeholder, value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ font: "var(--text-label)", color: "var(--text-dim)", padding: "0 2px" }}>{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{
          background: "#fff",
          border: "1.5px solid var(--container-highest)",
          borderRadius: "var(--radius-input)",
          padding: "13px 14px",
          fontFamily: "var(--font-sans)",
          fontSize: 14.5,
          color: "var(--text)",
          fontVariantNumeric: "tabular-nums",
          outline: "none",
        }}
      />
    </div>
  );
}

function AmountInput({ amount, setAmount, maxUnits }) {
  const chips = [5000, 15000];
  return (
    <div style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 20, textAlign: "center" }}>
      <div style={{ font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase" }}>Amount to cash out</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4, margin: "8px 0 2px" }}>
        <span style={{ font: "var(--text-display)", fontSize: 30, color: "var(--text)" }}>₱</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ border: "none", outline: "none", background: "transparent", font: "var(--text-display)", fontSize: 34, color: "var(--text)", width: 180, textAlign: "center", fontVariantNumeric: "tabular-nums" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => setAmount(String(c))}
            style={{ flex: 1, background: "var(--container)", color: "var(--primary)", border: "none", borderRadius: "var(--radius-chip)", padding: "8px 4px", fontWeight: 700, fontSize: 12, fontFamily: "var(--font-sans)", cursor: "pointer" }}
          >
            ₱{c.toLocaleString()}
          </button>
        ))}
        <button
          onClick={() => setAmount(String(Math.round(maxUnits)))}
          style={{ flex: 1, background: "var(--primary)", color: "var(--on-primary)", border: "none", borderRadius: "var(--radius-chip)", padding: "8px 4px", fontWeight: 700, fontSize: 12, fontFamily: "var(--font-sans)", cursor: "pointer" }}
        >
          Max
        </button>
      </div>
    </div>
  );
}

function QrCard({ code }) {
  const cells = React.useMemo(() => Array.from({ length: 49 }, () => Math.random() < 0.42), []);
  return (
    <div style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
      <div style={{ width: 168, height: 168, borderRadius: 14, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: "repeat(7, 1fr)", gap: 4, padding: 12, background: "#fff", border: "1.5px solid var(--container-highest)" }}>
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
  return <p style={{ font: "var(--text-fine)", color: "var(--text-faint)", textAlign: "center", padding: "4px 8px" }}>{text}</p>;
}

function Spinner() {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: "3px solid var(--container-highest)",
        borderTopColor: "var(--primary)",
        animation: "cashout-spin 0.7s linear infinite",
        marginBottom: 8,
      }}
    >
      <style>{"@keyframes cashout-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}
