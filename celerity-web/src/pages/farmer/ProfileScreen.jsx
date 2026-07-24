import React from "react";
import { short, UNIT } from "../../lib/config";
import { toPHP } from "../../lib/anchor";

export default function ProfileScreen({
  me,
  registration,
  farmerName,
  receipts = [],
  pools = [],
  onResetDemo,
}) {
  const totalUnits = receipts.reduce((sum, r) => sum + Number(BigInt(r.amount)) / Number(UNIT), 0);
  const payouts = receipts.length;
  const programs = new Set(receipts.map((r) => String(r.pool_id))).size;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 18px 22px" }}>
      {/* identity */}
      <div className="cel-fade" style={cardCenter}>
        <div style={avatarStyle}>{farmerName.slice(0, 2).toUpperCase()}</div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{farmerName}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>
          {registration ? `Region ${registration.region}` : "Not yet registered"}
        </div>
        {registration && (
          <span style={verifiedChip}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M3 7.2 5.5 9.7 11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Verified beneficiary
          </span>
        )}
      </div>

      {/* impact */}
      <div className="cel-fade cel-fade-1">
        <p style={sectionLabel}>Your relief so far</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 8 }}>
          <StatTile value={toPHP(totalUnits)} label="Received" wide />
          <StatTile value={String(payouts)} label={payouts === 1 ? "Payout" : "Payouts"} />
          <StatTile value={String(programs)} label={programs === 1 ? "Program" : "Programs"} />
        </div>
      </div>

      {/* how it works */}
      <div className="cel-fade cel-fade-2">
        <p style={sectionLabel}>How Celerity works</p>
        <div style={{ ...infoCardStyle, padding: "6px 0", marginTop: 8 }}>
          <Step n="1" title="Relief is funded ahead of time" body="Aid groups pre-load relief for your region, before any storm." />
          <Step n="2" title="A signed typhoon triggers it" body="When an official signal is confirmed, your relief is released automatically." />
          <Step n="3" title="You claim and cash out" body="It lands in your wallet — claim it, then withdraw to pesos." last />
        </div>
      </div>

      {/* registration */}
      <div className="cel-fade cel-fade-3">
        <p style={sectionLabel}>Registration</p>
        <div style={{ ...infoCardStyle, marginTop: 8 }}>
          {registration ? (
            <>
              <InfoRow k="Enrolled by" v={short(registration.registered_by)} />
              <InfoRow k="Region" v={String(registration.region)} last />
            </>
          ) : (
            <div style={{ padding: 16, font: "var(--text-fine)", color: "var(--text-faint)" }}>
              Not registered yet — an LGU/co-op admin must enroll you before you can receive releases.
            </div>
          )}
        </div>
      </div>

      {/* help */}
      <div className="cel-fade cel-fade-4">
        <p style={sectionLabel}>Help &amp; support</p>
        <div style={{ ...infoCardStyle, marginTop: 8 }}>
          <InfoRow k="Your co-op" v="Barangay San Isidro Co-op" />
          <InfoRow k="Hotline" v="1-800-CELERITY" />
          <InfoRow k="Report a problem" v="Talk to your co-op officer" faint last />
        </div>
      </div>

      {/* demo controls — clears local cash-out history for a clean live run */}
      {onResetDemo && (
        <div className="cel-fade cel-fade-4" style={{ marginTop: 2 }}>
          <button onClick={onResetDemo} style={resetButtonStyle} className="cel-press">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
            </svg>
            Reset demo wallet
            <span style={demoTag}>DEMO</span>
          </button>
          <p style={{ margin: "6px 8px 0", font: "var(--text-fine)", fontSize: 11.5, color: "var(--text-faint)", textAlign: "center" }}>
            Clears local cash-out history only. On-chain relief is untouched.
          </p>
        </div>
      )}
    </div>
  );
}

function StatTile({ value, label, wide }) {
  return (
    <div style={{ gridColumn: wide ? "span 1" : "auto", background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", border: "1px solid var(--container-highest)", padding: "14px 12px", textAlign: "center", display: "flex", flexDirection: "column", gap: 2, justifyContent: "center" }}>
      <div style={{ font: "var(--text-money)", fontSize: wide ? 17 : 20, color: "var(--primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <div style={{ font: "var(--text-label)", fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)" }}>{label}</div>
    </div>
  );
}

function Step({ n, title, body, last }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: last ? "none" : "1px solid var(--surface-low)" }}>
      <div style={{ width: 26, height: 26, borderRadius: 999, background: "var(--primary)", color: "#fff", display: "grid", placeItems: "center", font: "var(--text-fine)", fontWeight: 700, flexShrink: 0 }}>{n}</div>
      <div>
        <div style={{ font: "var(--text-table)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{title}</div>
        <div style={{ font: "var(--text-fine)", fontSize: 12.5, color: "var(--text-faint)", marginTop: 1, lineHeight: 1.4 }}>{body}</div>
      </div>
    </div>
  );
}

function InfoRow({ k, v, faint, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: last ? "none" : "1px solid var(--container-highest)", font: "var(--text-table)", fontSize: 13.5 }}>
      <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>{k}</span>
      <span style={{ color: faint ? "var(--text-faint)" : "var(--text)", fontWeight: faint ? 500 : 700, textAlign: "right" }}>{v}</span>
    </div>
  );
}

const sectionLabel = {
  margin: "0 0 0 2px",
  font: "var(--text-label)",
  color: "var(--text-faint)",
  textTransform: "uppercase",
  letterSpacing: "var(--tracking-label)",
};

const cardCenter = {
  background: "#fff",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  padding: "24px 20px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  textAlign: "center",
};

const avatarStyle = {
  width: 64,
  height: 64,
  borderRadius: "50%",
  background: "linear-gradient(160deg, var(--primary-hover), var(--primary))",
  color: "var(--on-primary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  font: "var(--text-h2)",
  boxShadow: "var(--shadow-raised)",
};

const verifiedChip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "var(--ok-bg)",
  color: "var(--ok-text)",
  borderRadius: "var(--radius-chip)",
  padding: "4px 12px",
  font: "var(--text-fine)",
  fontWeight: 700,
  marginTop: 4,
};

const infoCardStyle = {
  background: "#fff",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  border: "1px solid var(--container-highest)",
};

const resetButtonStyle = {
  width: "100%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  background: "var(--warn-bg)",
  color: "var(--warn-text)",
  border: "1px solid var(--warn-line)",
  borderRadius: "var(--radius-control)",
  padding: "12px 16px",
  font: "var(--text-fine)",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  boxSizing: "border-box",
};

const demoTag = {
  font: "var(--text-label)",
  fontSize: 9.5,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "var(--tracking-label)",
  background: "var(--warn-text)",
  color: "var(--warn-bg)",
  borderRadius: 999,
  padding: "1px 7px",
};
