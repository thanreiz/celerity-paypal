import React from "react";
import Button from "../../design/Button";
import { FUNDERS } from "../../lib/funders";
import { addr } from "../../lib/celerity";
import { short } from "../../lib/config";

const ICONS = {
  funder: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
      <path d="M3 20h18" />
    </svg>
  ),
  funder2: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21v-8" />
      <path d="M12 13c0-4 3-7 8-7 0 4-3 7-8 7Z" />
      <path d="M12 13c0-3-2.5-5.5-6.5-5.5 0 3.2 2.5 5.5 6.5 5.5Z" />
    </svg>
  ),
};

/** Pick-your-institution gate — branded, identity-first. */
export default function LoginScreen({ onLogin, onBackToFarmer }) {
  return (
    <div
      className="cel-halo"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-8) var(--space-6)",
        fontFamily: "var(--font-sans)",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {onBackToFarmer && (
        <button
          onClick={onBackToFarmer}
          className="cel-press"
          style={{
            position: "absolute",
            top: "max(12px, env(safe-area-inset-top))",
            left: "max(12px, env(safe-area-inset-left))",
            border: "1px solid var(--border-subtle)",
            background: "var(--surface)",
            color: "var(--text-dim)",
            borderRadius: "var(--radius-control)",
            padding: "10px 16px",
            minHeight: 44,
            font: "var(--text-fine)",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            zIndex: 2,
          }}
        >
          ← Farmer app
        </button>
      )}
      <div style={{ textAlign: "center", maxWidth: 720, width: "100%", paddingTop: 48 }}>
        <img
          src="/logo-lockup.png"
          alt="Celerity"
          style={{ height: "auto", width: "min(200px, 55vw)", margin: "0 auto 18px", display: "block" }}
        />
        <div style={{ color: "var(--primary)", font: "var(--text-h1)", fontSize: "clamp(24px, 6vw, 30px)", letterSpacing: "var(--tracking-tight)" }}>
          Funder console
        </div>
        <p style={{ margin: "8px 0 6px", font: "var(--text-meta)", color: "var(--text-dim)", fontWeight: 600, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
          Independent sub-pools. One signed event. Per-funder ledger.
        </p>
        <p style={{ margin: "0 0 28px", font: "var(--text-fine)", color: "var(--text-faint)", fontWeight: 600 }}>
          Choose your institution — every action signs with that funder&apos;s key.
        </p>

        <div className="cel-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, textAlign: "left" }}>
          {FUNDERS.map((f) => (
            <div
              key={f.role}
              className="cel-raise cel-card-surface"
              style={{
                padding: "26px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: "var(--container)",
                  color: "var(--primary)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {ICONS[f.role]}
              </span>
              <h3 style={{ margin: 0, font: "var(--text-h2)", fontSize: 18, color: "var(--text)" }}>{f.label}</h3>
              <p style={{ margin: 0, font: "var(--text-fine)", color: "var(--text-faint)", minHeight: 38 }}>{f.desc}</p>
              <p style={{ margin: 0, font: "var(--text-fine)", color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
                {short(addr(f.role))} · Stellar Testnet
              </p>
              <Button variant="primary" style={{ alignSelf: "flex-start" }} onClick={() => onLogin(f.role)}>
                Log in →
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
