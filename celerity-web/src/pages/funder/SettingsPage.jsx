import React, { useState } from "react";
import Switch from "../../design/Switch";
import StatusPill from "../../design/StatusPill";
import Badge from "../../design/Badge";
import { CONTRACT_ID, short } from "../../lib/config";
import { FUNDERS, funderByRole } from "../../lib/funders";
import { addr } from "../../lib/celerity";

export default function SettingsPage({ who, me, funders }) {
  const [prefs, setPrefs] = useState({ disbursements: true, threshold: true, audits: false });
  const identity = funderByRole(who);
  const labelFor = (address) => FUNDERS.find((f) => addr(f.role) === address)?.label;

  return (
    <div style={{ display: "flex", gap: 24, padding: "8px 32px 48px", maxWidth: 1120, margin: "0 auto", width: "100%", boxSizing: "border-box", flexWrap: "wrap" }}>
      <div style={{ width: 320, flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ background: "#fff", border: "1px solid var(--container-highest)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 24 }}>
          <p style={{ margin: "0 0 4px", font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase" }}>Acting Identity</p>
          <p style={{ margin: "0 0 12px", font: "var(--text-body-lg)" }}>
            {identity?.label ?? who}{" "}
            <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>({who} key)</span>
          </p>
          <p style={{ margin: 0, font: "var(--text-label)", color: "var(--text-faint)", textTransform: "uppercase" }}>Address</p>
          <p style={{ margin: 0, font: "var(--text-table)", fontVariantNumeric: "tabular-nums" }}>{short(me)}</p>
        </div>
        <div style={{ background: "#fff", border: "1px solid var(--container-highest)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 24 }}>
          <h3 style={{ margin: "0 0 12px", font: "var(--text-body-lg)" }}>Network Connectivity</h3>
          <div style={{ background: "var(--surface-low)", border: "1px solid var(--container-highest)", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>Network</span>
              <StatusPill status="Active" />
            </div>
            <div style={{ font: "var(--text-table)", fontWeight: 700 }}>Stellar Testnet</div>
            <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", marginTop: 4 }}>contract {short(CONTRACT_ID)}</div>
          </div>
        </div>
      </div>
      <div style={{ flex: "2 1 420px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ background: "#fff", border: "1px solid var(--container-highest)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <h3 style={{ margin: 0, font: "var(--text-body-lg)" }}>Ledger Notifications</h3>
            <Badge stub>local preference only — no backend to send these yet</Badge>
          </div>
          {[
            ["disbursements", "Escrow Disbursements", "Alerts for successful funds release to farmers."],
            ["threshold", "Pool Replenishment Threshold", "Warn when a pool balance falls below 20%."],
            ["audits", "Compliance Audits", "Monthly summary of ledger integrity."],
          ].map(([key, label, sub], i) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderTop: i ? "1px solid var(--container-highest)" : "none" }}>
              <div>
                <div style={{ font: "var(--text-table)", fontWeight: 700 }}>{label}</div>
                <div style={{ font: "var(--text-fine)", color: "var(--text-faint)", marginTop: 2 }}>{sub}</div>
              </div>
              <Switch checked={prefs[key]} onChange={() => setPrefs({ ...prefs, [key]: !prefs[key] })} />
            </div>
          ))}
        </div>
        <div style={{ background: "#fff", border: "1px solid var(--container-highest)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", padding: 24 }}>
          <h3 style={{ margin: "0 0 12px", font: "var(--text-body-lg)" }}>Funders seen on this contract</h3>
          <p style={{ margin: "0 0 12px", font: "var(--text-fine)", color: "var(--text-faint)" }}>
            Every distinct funder address with at least one pool.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {funders.map((f) => (
              <div key={f} style={{ font: "var(--text-table)", fontVariantNumeric: "tabular-nums", padding: "6px 0", borderTop: "1px solid var(--container-highest)" }}>
                {labelFor(f) ? `${labelFor(f)} · ` : ""}{short(f)}{" "}
                {f === me && <span style={{ color: "var(--text-faint)", fontWeight: 500 }}>(you)</span>}
              </div>
            ))}
            {funders.length === 0 && <p style={{ font: "var(--text-fine)", color: "var(--text-faint)" }}>No funders yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
