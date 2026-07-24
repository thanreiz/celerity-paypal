import React from "react";
import { short, CONTRACT_ID } from "../../lib/config";
import { funderLabel } from "../../lib/celerity";
import { formatDate } from "../../lib/activityTime";
import { regionName } from "../../lib/regions";

/**
 * Transaction detail — a plain-language overview of one movement.
 *
 * For a received relief payout: shows the on-chain flow (Celerity escrow
 * contract → your wallet), the funder / region / pool, and a link to the live
 * record on stellar.expert. For a demo cash-out: shows your wallet → the
 * cash-out destination, clearly labeled a simulation. `tx` is the normalized
 * row from ActivityScreen.
 */
export default function TxDetailScreen({ tx, me, pools, onBack }) {
  const isReceived = tx.kind === "received";
  const region = tx.region;
  const amountStr = `${isReceived ? "+" : "−"}₱${Math.round(tx.amountPhp).toLocaleString()}`;

  return (
    <div className="cel-overlay" style={{ position: "absolute", inset: 0, background: "var(--paper-page)", display: "flex", flexDirection: "column", zIndex: 25 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 8px" }}>
        <button onClick={onBack} aria-label="Back" className="cel-press" style={backBtnStyle}>←</button>
        <div style={{ font: "var(--text-h2)", fontSize: 18 }}>Transaction</div>
      </div>

      <div className="cel-stagger" style={{ flex: 1, overflowY: "auto", padding: "8px 20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* amount hero */}
        <div className="cel-pop" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 0 4px", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, display: "grid", placeItems: "center", background: isReceived ? "var(--ok-bg)" : "var(--container)", color: isReceived ? "var(--ok-text)" : "var(--primary)" }}>
            {isReceived ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 4v12M6.5 11 12 16.5 17.5 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 20V8M6.5 13 12 7.5 17.5 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            )}
          </div>
          <div style={{ font: "var(--text-hero)", fontSize: 40, color: isReceived ? "var(--ok-text)" : "var(--text)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
            {amountStr}
          </div>
          <div style={{ font: "var(--text-body-lg)", fontSize: 15, color: "var(--text-dim)", fontWeight: 600 }}>
            {isReceived ? `Relief received · ${funderLabel(tx.funder)}` : `Cashed out to ${tx.destLabel}`}
          </div>
        </div>

        {/* from → to flow */}
        <div style={cardStyle}>
          <FlowNode
            title={isReceived ? "Celerity relief fund" : "Your wallet"}
            sub={isReceived ? short(CONTRACT_ID) : short(me)}
            tone={isReceived ? "primary" : "you"}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0 2px 21px" }}>
            <div style={{ width: 2, height: 22, background: "var(--container-highest)", borderRadius: 2 }} />
            <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>{isReceived ? "released to" : "sent to"}</span>
          </div>
          <FlowNode
            title={isReceived ? "Your wallet" : tx.destLabel}
            sub={isReceived ? short(me) : (tx.isDemo ? "Simulated destination" : "")}
            tone={isReceived ? "you" : "dest"}
          />
        </div>

        {/* detail rows */}
        <div style={cardStyle}>
          <Row k="Amount" v={amountStr} strong />
          {tx.when != null && <Row k="Date" v={formatDate(tx.when, Date.now())} />}
          {isReceived && <Row k="From funder" v={funderLabel(tx.funder)} />}
          {region != null && <Row k="Region" v={regionName(region)} />}
          <Row k="Type" v={isReceived ? "Relief received" : "Cash-out (demo)"} last />
        </div>

        {/* plain explanation */}
        <p style={{ font: "var(--text-body)", fontSize: 14, color: "var(--text-dim)", lineHeight: 1.5, margin: "0 2px", textAlign: "center" }}>
          {isReceived
            ? `A signed typhoon signal for ${region != null ? regionName(region) : "your area"} released this relief from ${funderLabel(tx.funder)} straight to your wallet — no forms, no waiting.`
            : `You moved ${amountStr.replace("−", "")} out of your wallet to ${tx.destLabel}. In production this settles through a licensed Stellar anchor; here it's simulated for the demo.`}
        </p>

        {/* on-chain link or demo note */}
        {isReceived ? (
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
            target="_blank"
            rel="noreferrer"
            className="cel-press"
            style={linkBtnStyle}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6.5 3.5H12.5V9.5M12.5 3.5 6.5 9.5M11 9.5v2A1.5 1.5 0 0 1 9.5 13h-6A1.5 1.5 0 0 1 2 11.5v-6A1.5 1.5 0 0 1 3.5 4h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            View on Stellar (stellar.expert)
          </a>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, font: "var(--text-fine)", color: "var(--warn-text)", background: "var(--warn-bg)", border: "1px solid var(--warn-line)", borderRadius: "var(--radius-control)", padding: "10px 14px", fontWeight: 700 }}>
            Simulated cash-out · demo only
          </div>
        )}
      </div>
    </div>
  );
}

function FlowNode({ title, sub, tone }) {
  const tones = {
    primary: { bg: "var(--primary)", color: "#fff" },
    you: { bg: "var(--ok-bg)", color: "var(--ok-text)" },
    dest: { bg: "var(--container)", color: "var(--primary)" },
  };
  const t = tones[tone] || tones.dest;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: t.bg, color: t.color, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.4" /></svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "var(--text-table)", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{title}</div>
        {sub && <div style={{ font: "var(--text-fine)", fontSize: 12, color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>{sub}</div>}
      </div>
    </div>
  );
}

function Row({ k, v, strong, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: last ? "none" : "1px solid var(--container-highest)", font: "var(--text-table)", fontSize: 13.5 }}>
      <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>{k}</span>
      <span style={{ color: "var(--text)", fontWeight: strong ? 700 : 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}

const cardStyle = {
  background: "#fff",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
  border: "1px solid var(--container-highest)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
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

const linkBtnStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  textDecoration: "none",
  background: "var(--primary)",
  color: "var(--on-primary)",
  borderRadius: "var(--radius-control)",
  padding: "13px 16px",
  font: "var(--text-body-lg)",
  fontWeight: 700,
  fontSize: 15,
  boxShadow: "var(--shadow-raised)",
};
