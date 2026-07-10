import React from "react";
import { fmtUnits, UNIT } from "../../lib/config";
import { funderLabel } from "../../lib/celerity";

/** The 4 Home quick-action tiles each open one of these — real pool/receipt
 * data reshaped into a friendlier, non-technical view. */
export default function DetailScreen({ kind, pools, registration, onBack }) {
  const recurring = pools.filter((p) => p.installments > 1);

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--paper-page)", display: "flex", flexDirection: "column", zIndex: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 8px" }}>
        <button onClick={onBack} aria-label="Back" style={backBtnStyle}>←</button>
        <div style={{ font: "var(--text-h2)", fontSize: 18 }}>{TITLES[kind]}</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {kind === "programs" && (
          <>
            {pools.map((p) => (
              <ListItem
                key={String(p.id)}
                icon="🌾"
                title={funderLabel(p.funder)}
                subtitle={`${fmtUnits(p.payout_per_farmer)} units${p.installments > 1 ? ` × ${p.installments} installments` : " one-time relief"} · Region ${p.region}`}
              />
            ))}
            {pools.length === 0 && <Empty text="No relief programs active yet." />}
            <Honesty text="You're automatically enrolled in every relief program active in your registered region." />
          </>
        )}

        {kind === "installments" && (
          <>
            {recurring.map((p) => (
              <ListItem key={String(p.id)} icon="📅" title={`Pool #${String(p.id)}`} subtitle={`${fmtUnits(p.payout_per_farmer)} units per installment · every ${String(p.claim_period_secs)}s`} />
            ))}
            {recurring.length === 0 && <Empty text="No recurring installments yet." />}
            <Honesty text="Installments unlock automatically on schedule — nothing to request, nothing to wait on a case worker for." />
          </>
        )}

        {kind === "region" && (
          <>
            <InfoCard>
              <InfoRow k="Region" v={registration ? String(registration.region) : "Not registered"} />
              <InfoRow k="Registered by" v={registration ? String(registration.registered_by).slice(0, 4) + "…" + String(registration.registered_by).slice(-4) : "—"} />
              <InfoRow k="Active programs here" v={String(pools.length)} />
            </InfoCard>
            <Honesty text="Relief releases when an official typhoon signal is confirmed for your region — you don't need to file anything." />
          </>
        )}

        {kind === "help" && (
          <InfoCard>
            <InfoRow k="Your co-op" v="Barangay San Isidro Co-op" />
            <InfoRow k="Hotline" v="1-800-CELERITY" />
            <InfoRow k="Report an issue" v="Talk to your co-op officer" faint />
          </InfoCard>
        )}
      </div>
    </div>
  );
}

const TITLES = {
  programs: "Relief Programs",
  installments: "Installments",
  region: "My Region",
  help: "Help",
};

const backBtnStyle = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "#fff",
  boxShadow: "var(--shadow-card)",
  border: "none",
  fontSize: 16,
  color: "var(--text)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};

function ListItem({ icon, title, subtitle }) {
  return (
    <div style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--container)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ font: "var(--text-body-lg)", fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function InfoCard({ children }) {
  return <div style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)" }}>{children}</div>;
}

function InfoRow({ k, v, faint }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--container-highest)", font: "var(--text-table)", fontSize: 13.5 }}>
      <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>{k}</span>
      <span style={{ color: faint ? "var(--text-faint)" : "var(--text)", fontWeight: faint ? 500 : 700, textAlign: "right" }}>{v}</span>
    </div>
  );
}

function Empty({ text }) {
  return <p style={{ font: "var(--text-fine)", color: "var(--text-faint)", padding: "0 4px" }}>{text}</p>;
}

function Honesty({ text }) {
  return <p style={{ font: "var(--text-fine)", color: "var(--text-faint)", textAlign: "center", padding: "4px 8px" }}>{text}</p>;
}
