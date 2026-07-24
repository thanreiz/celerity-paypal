import React, { useState } from "react";
import Button from "../../design/Button";
import { short } from "../../lib/config";

/**
 * "Is this you?" — the one-tap wallet confirm screen, built for farmers.
 *
 * The farmer's wallet is already configured (the demo signer in .env), so there
 * is no seed phrase, no password, no wallet-connect dance. A first-time rural
 * smartphone user just answers one question — "is this me?" — so the person is
 * the hero: big avatar + name + town, plain-language reassurance, a clear
 * "Yes, this is me" and an obvious "This isn't me" escape hatch. The wallet
 * address stays tucked behind a tap (present for honesty, out of the way).
 * The only trust claim is "Secured on Stellar" — no bank or regulatory language.
 */
export default function ConnectScreen({
  me,
  farmerName = "Mang Ramon",
  region = "Bicol Region",
  farmers,
  activeRole,
  onSwitchFarmer,
  onConnected,
  onNotMe,
}) {
  const [showId, setShowId] = useState(false);

  const initials = farmerName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="cel-connect">
      <div className="cel-connect-top">
        <img className="cel-connect-logo" src="/logo-lockup.png" alt="Celerity" />
        <h1 className="cel-connect-h">Is this you?</h1>
      </div>

      {farmers?.length > 1 && onSwitchFarmer && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
          {farmers.map((f) => {
            const on = f.role === activeRole;
            return (
              <button
                key={f.role}
                type="button"
                onClick={() => onSwitchFarmer(f.role)}
                className="cel-press"
                style={{
                  border: on ? "1.5px solid var(--primary)" : "1px solid var(--container-highest)",
                  background: on ? "var(--ok-bg)" : "#fff",
                  color: on ? "var(--ok-text)" : "var(--text-dim)",
                  borderRadius: 999,
                  padding: "8px 14px",
                  font: "var(--text-fine)",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {f.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="cel-id-card cel-id-card--person">
        <span className="cel-id-badge">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2 5 8.6 9.6 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Registered
        </span>

        <div className="cel-id-avatar cel-id-avatar--lg">
          {initials}
          <span className="cel-id-check" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M6 12.5 10 16.5 18 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        <p className="cel-id-name cel-id-name--lg">{farmerName}</p>
        <p className="cel-id-region cel-id-region--icon">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1.5c2.5 0 4.5 2 4.5 4.4C11.5 9 7 12.5 7 12.5S2.5 9 2.5 5.9C2.5 3.5 4.5 1.5 7 1.5Z" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="7" cy="5.9" r="1.5" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          {region}
        </p>

        <p className="cel-id-reassure">Your relief money is safe here — only you can open this wallet.</p>

        <button
          type="button"
          className={`cel-id-wallet${showId ? " is-open" : ""}`}
          onClick={() => setShowId((s) => !s)}
          aria-expanded={showId}
        >
          <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
            <rect x="1.5" y="3.5" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.5 6.5h11" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span className="cel-id-wallet-lbl">Wallet ID</span>
          <span className="cel-id-wallet-val">{showId ? (me ? short(me) : "—") : "tap to show"}</span>
          <svg className="cel-id-wallet-chev" width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="cel-connect-actions">
        <Button variant="primary" onClick={onConnected} style={{ width: "100%", fontSize: 16, minHeight: 52 }}>
          Yes, this is me
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ marginLeft: 2 }}>
            <path d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>

        {onNotMe && (
          <button type="button" className="cel-id-notme" onClick={onNotMe}>
            This isn't me
          </button>
        )}

        <span className="cel-trust cel-connect-foot">
          <svg width="13" height="14" viewBox="0 0 13 14" fill="none">
            <path d="M6.5 1 11.5 3.1V6.7C11.5 9.9 9.4 12.3 6.5 13 3.6 12.3 1.5 9.9 1.5 6.7V3.1L6.5 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4.5 6.9 6 8.4 8.7 5.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Secured on Stellar
        </span>
      </div>
    </div>
  );
}
