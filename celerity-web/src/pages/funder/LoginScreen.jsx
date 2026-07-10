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

/** Pick-your-institution gate — the funder console is identity-first, like a
 * banking app. Both cards render from the same FUNDERS list, so the two
 * demo funders are interchangeable by construction. */
export default function LoginScreen({ onLogin, onBackToFarmer }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--paper-page)",
        display: "grid",
        placeItems: "center",
        padding: "48px 24px",
        fontFamily: "var(--font-sans)",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {onBackToFarmer && (
        <button
          onClick={onBackToFarmer}
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            border: "1px solid var(--container-highest)",
            background: "var(--surface)",
            color: "var(--text-dim)",
            borderRadius: 999,
            padding: "8px 16px",
            font: "var(--text-fine)",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          ← Farmer app
        </button>
      )}
      <div style={{ textAlign: "center", maxWidth: 720, width: "100%" }}>
        <div style={{ color: "var(--primary)", font: "var(--text-h1)", fontSize: 30, letterSpacing: "var(--tracking-tight)" }}>
          Celerity Funder
        </div>
        <p style={{ margin: "6px 0 30px", font: "var(--text-meta)", color: "var(--text-faint)", fontWeight: 600 }}>
          Choose your institution — every action signs with that funder's key.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, textAlign: "left" }}>
          {FUNDERS.map((f) => (
            <div
              key={f.role}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--container-highest)",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--shadow-card)",
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

        <p style={{ margin: "26px 0 0", font: "var(--text-fine)", color: "var(--text-faint)" }}>
          Demo identities — keys are injected from the environment, there is no real authentication.
        </p>
      </div>
    </div>
  );
}
