import React from "react";
import Button from "../../design/Button";
import { short } from "../../lib/config";

/**
 * "This is me" — the one-tap wallet confirm screen.
 *
 * The farmer's wallet is already configured (the demo signer in .env), so there
 * is no seed phrase, no password, no wallet-connect dance. The farmer just
 * confirms the identity is theirs and taps in. The only trust claim is
 * "Secured on Stellar" — no bank or regulatory language.
 */
export default function ConnectScreen({ me, farmerName = "Mang Ramon", region = "Bicol Region", onConnected }) {
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
        <h1 className="cel-connect-h">Welcome back</h1>
        <p className="cel-connect-sub">Check that this is you, then tap to open your wallet.</p>
      </div>

      <div className="cel-id-card">
        <span className="cel-id-badge">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2 5 8.6 9.6 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Registered
        </span>

        <div className="cel-id-avatar">{initials}</div>
        <p className="cel-id-name">{farmerName}</p>
        <p className="cel-id-region">{region}</p>

        <span className="cel-id-addr">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <rect x="1.5" y="3.5" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1.5 6.5h11" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          {me ? short(me) : "—"}
        </span>
      </div>

      <div className="cel-connect-actions">
        <div className="cel-connect-ready">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4.5 7 6.2 8.7 9.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Your wallet is ready — no setup needed
        </div>

        <Button variant="primary" onClick={onConnected} style={{ width: "100%", fontSize: 16, minHeight: 52 }}>
          This is me — enter my wallet
        </Button>

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
