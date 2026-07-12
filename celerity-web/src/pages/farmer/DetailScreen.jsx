import React from "react";
import { UNIT } from "../../lib/config";
import { phpValue } from "../../lib/anchor";
import { funderLabel } from "../../lib/celerity";
import { regionName } from "../../lib/regions";

const unitsOf = (stroops) => Number(BigInt(stroops)) / Number(UNIT);

/** The 4 Home quick-action tiles each open one of these — real pool/receipt
 * data reshaped into a friendlier, non-technical view. */
export default function DetailScreen({ kind, pools, registration, onBack }) {
  const recurring = pools.filter((p) => p.installments > 1);
  const myRegion = registration ? Number(registration.region) : null;
  const regionPools = myRegion != null ? pools.filter((p) => Number(p.region) === myRegion) : [];
  const armedPools = regionPools.filter((p) => p.status === "Active");
  const minSignal = armedPools.length
    ? Math.min(...armedPools.map((p) => Number(p.signal_threshold)))
    : null;

  return (
    <div className="cel-overlay" style={{ position: "absolute", inset: 0, background: "var(--paper-page)", display: "flex", flexDirection: "column", zIndex: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 8px" }}>
        <button onClick={onBack} aria-label="Back" className="cel-press" style={backBtnStyle}>←</button>
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
                subtitle={`${phpValue(unitsOf(p.payout_per_farmer))}${p.installments > 1 ? ` × ${p.installments} installments` : " one-time relief"} · ${regionName(p.region)}`}
              />
            ))}
            {pools.length === 0 && <Empty text="No relief programs active yet." />}
            <Honesty text="You're automatically enrolled in every relief program active in your registered region." />
          </>
        )}

        {kind === "installments" && (
          <>
            {recurring.map((p) => (
              <ListItem key={String(p.id)} icon="📅" title={funderLabel(p.funder)} subtitle={`${phpValue(unitsOf(p.payout_per_farmer))} per installment · every ${String(p.claim_period_secs)}s`} />
            ))}
            {recurring.length === 0 && <Empty text="No recurring installments yet." />}
            <Honesty text="Installments unlock automatically on schedule — nothing to request, nothing to wait on a case worker for." />
          </>
        )}

        {kind === "region" && (
          <>
            {/* status hero */}
            <div style={regionHero}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.16)", display: "grid", placeItems: "center", color: "#fff" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.7" /></svg>
                </div>
                <div>
                  <div style={{ font: "var(--text-h2)", fontSize: 19, color: "#fff" }}>{myRegion != null ? regionName(myRegion) : "Not registered"}</div>
                  <div style={{ font: "var(--text-fine)", color: "rgba(255,255,255,0.78)" }}>Your registered region</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: armedPools.length ? "#8ff0b0" : "rgba(255,255,255,0.5)" }} />
                <span style={{ font: "var(--text-body-lg)", fontSize: 14, color: "#fff", fontWeight: 700 }}>
                  {armedPools.length ? "Relief is armed and ready" : "No active relief right now"}
                </span>
              </div>
              {minSignal != null && (
                <div style={{ font: "var(--text-fine)", color: "rgba(255,255,255,0.78)", marginTop: 4 }}>
                  Releases automatically at typhoon signal {minSignal}+
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <MiniStat value={String(armedPools.length)} label={armedPools.length === 1 ? "Program armed" : "Programs armed"} />
              <MiniStat value={String(regionPools.length)} label="Total in region" />
            </div>

            <InfoCard>
              {regionPools.map((p) => (
                <InfoRow key={String(p.id)} k={funderLabel(p.funder)} v={p.status === "Active" ? "Armed" : p.status} />
              ))}
              {regionPools.length === 0 && <div style={{ padding: 16, font: "var(--text-fine)", color: "var(--text-faint)" }}>No relief programs in your region yet.</div>}
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
  return <div style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", border: "1px solid var(--container-highest)", overflow: "hidden" }}>{children}</div>;
}

function MiniStat({ value, label }) {
  return (
    <div style={{ background: "#fff", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", border: "1px solid var(--container-highest)", padding: "14px 16px", textAlign: "center" }}>
      <div style={{ font: "var(--text-hero)", fontSize: 26, color: "var(--primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <div style={{ font: "var(--text-label)", fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "var(--tracking-label)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

const regionHero = {
  background: "linear-gradient(158deg, var(--primary) 0%, var(--primary-hover) 100%)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-raised)",
  padding: "20px",
  color: "#fff",
};

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
