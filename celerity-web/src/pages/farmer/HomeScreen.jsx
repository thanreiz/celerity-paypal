import React from "react";
import Button from "../../design/Button";
import { fmtUnits, UNIT } from "../../lib/config";
import { toPHP, phpValue } from "../../lib/anchor";

export default function HomeScreen({ pools, receipts, busy, claim, onCashOut, onHistory, onDetail }) {
  const totalUnits = receipts.reduce((sum, r) => sum + Number(BigInt(r.amount)) / Number(UNIT), 0);
  const recurring = pools.filter((p) => p.installments > 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20 }}>
      <div
        style={{
          background: "linear-gradient(160deg, var(--primary) 0%, var(--primary-hover) 100%)",
          borderRadius: "var(--radius-card)",
          padding: "22px 22px 20px",
          color: "var(--on-primary)",
          boxShadow: "var(--shadow-raised)",
        }}
      >
        <div style={{ font: "var(--text-label)", color: "rgba(255,255,255,0.8)", textTransform: "uppercase" }}>
          💰 Available balance
        </div>
        <div style={{ font: "var(--text-hero)", fontSize: 38, margin: "6px 0 2px", color: "var(--on-primary)", fontVariantNumeric: "tabular-nums" }}>
          {toPHP(totalUnits)}
        </div>
        <div style={{ font: "var(--text-fine)", color: "rgba(255,255,255,0.75)" }}>Cashed out and ready to spend</div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Button variant="on" style={{ flex: 1, justifyContent: "center", background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }} onClick={onCashOut}>
            ↓ Cash Out
          </Button>
          <Button variant="on" style={{ flex: 1, justifyContent: "center", background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }} onClick={onHistory}>
            🧾 History
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, background: "#fff", borderRadius: "var(--radius-card)", padding: "18px 12px", boxShadow: "var(--shadow-card)" }}>
        <QuickAction icon="🌾" label="Relief Programs" onClick={() => onDetail("programs")} />
        <QuickAction icon="📅" label="Installments" onClick={() => onDetail("installments")} />
        <QuickAction icon="📍" label="My Region" onClick={() => onDetail("region")} />
        <QuickAction icon="☎️" label="Help" onClick={() => onDetail("help")} />
      </div>

      <div>
        <p style={{ margin: "0 0 10px 2px", font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)" }}>
          Upcoming payouts
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recurring.length === 0 && (
            <p style={{ margin: 0, padding: "0 4px", font: "var(--text-fine)", color: "var(--text-faint)" }}>No recurring pools yet.</p>
          )}
          {recurring.map((p) => {
            const amount = phpValue(Number(BigInt(p.payout_per_farmer)) / Number(UNIT));
            return (
              <div key={String(p.id)} style={claimCardStyle}>
                <div style={claimIconStyle}>🌾</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "var(--text-body-lg)", fontSize: 14, fontWeight: 700 }}>Pool #{String(p.id)}</div>
                  <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", marginTop: 1 }}>
                    {fmtUnits(p.payout_per_farmer)} units ×{p.installments}, every {String(p.claim_period_secs)}s
                  </div>
                </div>
                <Button variant="primary" size="sm" disabled={busy} onClick={() => claim(p.id)}>
                  Claim {amount}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, background: "var(--container)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>
        {icon}
      </div>
      <span style={{ font: "var(--text-fine)", fontSize: 11, color: "var(--text-dim)", textAlign: "center" }}>{label}</span>
    </button>
  );
}

const claimCardStyle = {
  background: "#fff",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  padding: 16,
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const claimIconStyle = {
  width: 42,
  height: 42,
  borderRadius: 12,
  background: "var(--ok-bg)",
  color: "var(--ok-text)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  flexShrink: 0,
};
